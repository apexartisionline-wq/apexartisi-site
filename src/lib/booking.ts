import "server-only";
import type { SlotKind } from "@prisma/client";
import { prisma } from "./db";
import { enc } from "./crypto";
import { closeCycleIfFull, cycleForNewBooking } from "./member";
import { bookingWindow, neededKind, pickSlot, slotCapacity, type Kind } from "./program";
import { getSettings } from "./settings";

export type BookResult = { ok: true; bookingId: string } | { ok: false; reason: string };

class BookingError extends Error {}

/** Ο τύπος θεραπευτή της πιο κοντινής ατομικής του μέλους πριν (αλλιώς μετά) από τη στιγμή. */
export async function neighbourKind(memberId: string, at: Date, exceptBookingId?: string): Promise<Kind | null> {
  const base = { memberId, kind: { not: null }, ...(exceptBookingId ? { id: { not: exceptBookingId } } : {}) } as const;
  const before = await prisma.booking.findFirst({
    where: { ...base, slot: { startsAt: { lt: at } } },
    orderBy: { slot: { startsAt: "desc" } },
  });
  if (before) return before.kind;
  const after = await prisma.booking.findFirst({
    where: { ...base, slot: { startsAt: { gt: at } } },
    orderBy: { slot: { startsAt: "asc" } },
  });
  return after?.kind ?? null;
}

/** Ελεύθερες θέσεις μιας ώρας· στο Therapair πρώτα όσες έχουν ήδη ένα μέλος. */
async function freeSlots(date: string, hour: number, kind: SlotKind, memberId: string, from: Date) {
  const capacity = slotCapacity(kind);
  // Αργία: εκείνη τη μέρα δεν κλείνονται ατομικές (υπεύθυνη 13/10).
  if (await prisma.holiday.findUnique({ where: { date }, select: { date: true } })) return [];
  const slots = await prisma.slot.findMany({
    where: { date, hour, kind, therapistId: { not: null }, startsAt: { gt: from } },
    include: { therapist: { select: { therapistKind: true } }, bookings: { select: { memberId: true } } },
    orderBy: { position: "asc" },
  });
  return slots
    .filter((x) => x.bookings.length < capacity && !x.bookings.some((b) => b.memberId === memberId))
    .sort((a, b) => b.bookings.length - a.bookings.length)
    .map((x) => ({ ...x, therapistKind: x.therapist?.therapistKind ?? null }));
}

/**
 * Κλείνει ώρα για ένα μέλος. Το μέλος διαλέγει μόνο ώρα (και αν είναι Therapair)·
 * το app διαλέγει θέση ώστε να τηρείται η εναλλαγή βιωματικού/κλινικού. Όλοι οι έλεγχοι
 * (όρια εβδομάδας/ημέρας, χωρητικότητα, κύκλος) γίνονται μέσα σε μία συναλλαγή με κλείδωμα
 * ανά μέλος και ανά θέση, ώστε δύο ταυτόχρονα πατήματα να μη δίνουν τρίτο ραντεβού.
 * Όταν η Εύα κλείνει για λογαριασμό μέλους, δεν ισχύουν το παράθυρο της Δευτέρας και τα όρια.
 */
export async function bookHour(args: {
  memberId: string;
  date: string;
  hour: number;
  kind: SlotKind;
  byAdmin?: boolean;
}): Promise<BookResult> {
  const { memberId, date, hour, kind, byAdmin } = args;
  const s = await getSettings();
  const now = new Date();
  const w = bookingWindow(now, s);

  if (!byAdmin) {
    if (!w.open) return { ok: false, reason: "Οι κρατήσεις είναι κλειστές αυτή την ώρα." };
    if (date < w.weekStart || date > w.weekEnd) return { ok: false, reason: "Η ώρα δεν είναι σε αυτή την εβδομάδα." };
  }

  const free = await freeSlots(date, hour, kind, memberId, byAdmin ? new Date(0) : now);
  if (free.length === 0) return { ok: false, reason: "Η ώρα δεν είναι πια ελεύθερη." };
  const prevKind = await neighbourKind(memberId, free[0].startsAt);
  // Χωρίς προηγούμενη ατομική και χωρίς ολοκληρωμένη αρχική αξιολόγηση: η 1η ατομική είναι με ψυχολόγο
  // (απόφαση 02: «ψυχολόγος στην 1η ατομική, ~40′»). Αν δεν υπάρχει, σημειώνεται για έλεγχο όπως κάθε απόκλιση.
  const needed = prevKind
    ? neededKind(prevKind)
    : (await prisma.assessment.findFirst({ where: { memberId, complete: true }, select: { id: true } })) ? null : "CLINICAL";
  const capacity = slotCapacity(kind);

  const tried = new Set<string>();
  while (tried.size < free.length) {
    const pick = pickSlot(free.filter((x) => !tried.has(x.id)), needed);
    if (!pick) break;
    tried.add(pick.slot.id);
    try {
      const booking = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`;
        await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${pick.slot.id} FOR UPDATE`;

        if (!byAdmin) {
          const mine = await tx.booking.findMany({
            where: { memberId, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
            include: { slot: { select: { date: true } } },
          });
          if (mine.length >= s.sessionsPerWeek)
            throw new BookingError(`Έχεις ήδη κλείσει ${s.sessionsPerWeek} ραντεβού αυτή την εβδομάδα.`);
          if (mine.some((b) => b.slot.date === date)) throw new BookingError("Έχεις ήδη ραντεβού αυτή τη μέρα.");
        }
        const taken = await tx.booking.count({ where: { slotId: pick.slot.id } });
        if (taken >= capacity) throw new Error("FULL");

        // Απόφοιτος (25/10): ατομικές με χρέωση ανά συνεδρία — χωρίς κύκλο (δεν μετρά σε «8 ατομικές», δεν ανοίγει νέο κύκλο).
        const alumnus = Boolean((await tx.user.findUnique({ where: { id: memberId }, select: { alumniSince: true } }))?.alumniSince);
        const cycleId = alumnus ? null : await cycleForNewBooking(tx, memberId, s);
        const created = await tx.booking.create({
          data: { slotId: pick.slot.id, memberId, cycleId, kind: pick.kind, alternationOk: pick.ok },
        });
        if (cycleId) await closeCycleIfFull(tx, cycleId);
        return created;
      });
      return { ok: true, bookingId: booking.id };
    } catch (e) {
      if (e instanceof BookingError) return { ok: false, reason: e.message };
      // Κάποιος άλλος πρόλαβε τη θέση — δοκίμασε την επόμενη.
      if (e instanceof Error && e.message === "FULL") continue;
      throw e;
    }
  }
  return { ok: false, reason: "Η ώρα δεν είναι πια ελεύθερη." };
}

/**
 * Μεταφέρει μια κράτηση σε άλλη ώρα (το κάνει η Εύα). Η κράτηση κρατά ταυτότητα,
 * κύκλο και ιστορικό — αλλάζει μόνο η θέση.
 */
export async function moveBooking(bookingId: string, date: string, hour: number, kind: SlotKind, byId: string): Promise<BookResult> {
  const old = await prisma.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
  if (!old) return { ok: false, reason: "Η κράτηση δεν υπάρχει." };
  const free = await freeSlots(date, hour, kind, old.memberId, new Date(0));
  if (free.length === 0) return { ok: false, reason: "Δεν υπάρχει ελεύθερη θέση με θεραπευτή εκείνη την ώρα." };
  const needed = neededKind(await neighbourKind(old.memberId, free[0].startsAt, bookingId));
  const pick = pickSlot(free, needed)!;
  const capacity = slotCapacity(kind);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${pick.slot.id} FOR UPDATE`;
      const taken = await tx.booking.count({ where: { slotId: pick.slot.id } });
      if (taken >= capacity) throw new Error("FULL");
      await tx.booking.update({
        where: { id: bookingId },
        data: { slotId: pick.slot.id, kind: pick.kind, alternationOk: pick.ok, joinedAt: null, confirmedCame: null, confirmedAt: null, confirmedById: null },
      });
      // Ιστορικό μεταφοράς (απόφαση 14/10): από πού σε πού, ποιος, πότε. Η ατομική μετρά μόνο στη νέα ημερομηνία·
      // στην παλιά περίοδο φαίνεται «1 μεταφέρθηκε» ως πληροφορία. Τήρηση 6 μήνες, μαζί με τις ακυρώσεις.
      await tx.recordHistory.create({ data: { kind: "booking_moved", memberId: old.memberId, ref: old.slot.id, byId, before: enc(JSON.stringify({ date: old.slot.date, hour: old.slot.hour, startsAt: old.slot.startsAt, kind: old.slot.kind, cycleId: old.cycleId, toDate: pick.slot.date, toHour: pick.slot.hour, toStartsAt: pick.slot.startsAt, toSlotId: pick.slot.id, joinedAt: old.joinedAt, confirmedCame: old.confirmedCame })) } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FULL") return { ok: false, reason: "Η ώρα γέμισε μόλις τώρα." };
    throw e;
  }
  return { ok: true, bookingId };
}

/** Οι ώρες μιας εβδομάδας με ελεύθερη θέση, χωριστά για ατομικές και Therapair. */
export async function openHours(from: string, to: string, after: Date) {
  const holidays = new Set((await prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true } })).map((h) => h.date));
  const slots = (await prisma.slot.findMany({
    where: { date: { gte: from, lte: to }, startsAt: { gt: after }, therapistId: { not: null } },
    include: { _count: { select: { bookings: true } } },
    orderBy: [{ date: "asc" }, { hour: "asc" }],
  })).filter((x) => !holidays.has(x.date));
  const out = new Map<string, { date: string; hour: number; kind: SlotKind; half: boolean }>();
  for (const x of slots) {
    if (x._count.bookings >= slotCapacity(x.kind)) continue;
    const key = `${x.date}|${x.hour}|${x.kind}`;
    const half = x.kind === "PAIR" && x._count.bookings === 1;
    const prev = out.get(key);
    out.set(key, { date: x.date, hour: x.hour, kind: x.kind, half: Boolean(prev?.half || half) });
  }
  return [...out.values()];
}

/**
 * Ακύρωση κράτησης (αναίρεση από το μέλος πριν κλείσουν οι κρατήσεις, ή από την Εύα).
 * Διορθώνει και τον κύκλο: αν είχε κλείσει λόγω αυτής της κράτησης, ξανανοίγει· αν ήταν
 * νέος, άδειος κύκλος που άνοιξε μόνο γι' αυτήν, σβήνεται.
 */
export async function cancelBooking(bookingId: string, by: { byId: string; reason: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
    if (!b) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${b.memberId}))`;
    // Ιστορικό ακύρωσης (απόφαση 14/10): ημερομηνία/ώρα της θέσης, ποιος, πότε — χωρίς κείμενο του μέλους. Τήρηση 6 μήνες
    // («ακυρωμένα ραντεβού», retention-db). Χρειάζεται για να γράφεται «1 ακυρώθηκε» στην εικόνα της περιόδου.
    await tx.recordHistory.create({ data: { kind: "booking_cancelled", memberId: b.memberId, ref: b.slot.id, byId: by.byId, before: enc(JSON.stringify({ reason: by.reason, date: b.slot.date, hour: b.slot.hour, startsAt: b.slot.startsAt, therapistId: b.slot.therapistId, kind: b.slot.kind, cycleId: b.cycleId, bookedAt: b.createdAt })) } });
    await tx.booking.delete({ where: { id: bookingId } });
    if (!b.cycleId) return;
    // Απόφοιτος (25/10): ο κύκλος του έκλεισε με την αποφοίτηση και δεν ξανανοίγει από ακύρωση παλιάς κράτησης.
    if ((await tx.user.findUnique({ where: { id: b.memberId }, select: { alumniSince: true } }))?.alumniSince) return;
    const cycle = await tx.cycle.findUnique({ where: { id: b.cycleId }, include: { _count: { select: { bookings: true } } } });
    if (!cycle) return;
    const latest = await tx.cycle.findFirst({ where: { memberId: b.memberId }, orderBy: { startedAt: "desc" } });
    const isLatest = latest?.id === cycle.id;
    const others = await tx.cycle.count({ where: { memberId: b.memberId, id: { not: cycle.id } } });
    if (isLatest && cycle._count.bookings === 0 && !cycle.settledAt && others > 0) {
      await tx.cycle.delete({ where: { id: cycle.id } });
      // Ο προηγούμενος κύκλος ξαναγίνεται ο τρέχων αν δεν είχε γεμίσει.
      const prev = await tx.cycle.findFirst({ where: { memberId: b.memberId }, orderBy: { startedAt: "desc" }, include: { _count: { select: { bookings: true } } } });
      if (prev && prev.closedAt && prev._count.bookings < prev.length) await tx.cycle.update({ where: { id: prev.id }, data: { closedAt: null } });
    } else if (isLatest && cycle.closedAt && cycle._count.bookings < cycle.length) {
      await tx.cycle.update({ where: { id: cycle.id }, data: { closedAt: null } });
    }
  });
}
