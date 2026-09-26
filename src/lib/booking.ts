import "server-only";
import { Prisma, type SlotKind } from "@prisma/client";
import { prisma } from "./db";
import { cycleForNewBooking } from "./member";
import { bookingWindow, neededKind, pickSlot, slotCapacity, type Kind } from "./program";
import { getSettings } from "./settings";

export type BookResult = { ok: true; bookingId: string } | { ok: false; reason: string };

/** Ο τύπος θεραπευτή της πιο κοντινής ατομικής του μέλους πριν (αλλιώς μετά) από τη στιγμή. */
async function neighbourKind(memberId: string, at: Date): Promise<Kind | null> {
  const before = await prisma.booking.findFirst({
    where: { memberId, kind: { not: null }, slot: { startsAt: { lt: at } } },
    orderBy: { slot: { startsAt: "desc" } },
  });
  if (before) return before.kind;
  const after = await prisma.booking.findFirst({
    where: { memberId, kind: { not: null }, slot: { startsAt: { gt: at } } },
    orderBy: { slot: { startsAt: "asc" } },
  });
  return after?.kind ?? null;
}

/**
 * Κλείνει ώρα για ένα μέλος. Το μέλος διαλέγει μόνο ώρα (και αν είναι Therapair)·
 * το app διαλέγει θέση ώστε να τηρείται η εναλλαγή βιωματικού/κλινικού. Όταν η Εύα
 * κλείνει για λογαριασμό μέλους, δεν ισχύουν το παράθυρο της Δευτέρας και τα όρια.
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

  if (!byAdmin) {
    const w = bookingWindow(now, s);
    if (!w.open) return { ok: false, reason: "Οι κρατήσεις είναι κλειστές αυτή την ώρα." };
    if (date < w.weekStart || date > w.weekEnd) return { ok: false, reason: "Η ώρα δεν είναι σε αυτή την εβδομάδα." };
    const mine = await prisma.booking.findMany({
      where: { memberId, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
      include: { slot: true },
    });
    if (mine.length >= s.sessionsPerWeek)
      return { ok: false, reason: `Έχεις ήδη κλείσει ${s.sessionsPerWeek} ραντεβού αυτή την εβδομάδα.` };
    if (mine.some((b) => b.slot.date === date)) return { ok: false, reason: "Έχεις ήδη ραντεβού αυτή τη μέρα." };
  }

  const capacity = slotCapacity(kind);
  const slots = await prisma.slot.findMany({
    where: { date, hour, kind, therapistId: { not: null }, startsAt: { gt: byAdmin ? new Date(0) : now } },
    include: { therapist: { select: { therapistKind: true } }, bookings: { select: { memberId: true } } },
    orderBy: { position: "asc" },
  });
  // Στο Therapair γεμίζουν πρώτα οι θέσεις που έχουν ήδη ένα μέλος.
  const free = slots
    .filter((x) => x.bookings.length < capacity && !x.bookings.some((b) => b.memberId === memberId))
    .sort((a, b) => b.bookings.length - a.bookings.length)
    .map((x) => ({ ...x, therapistKind: x.therapist?.therapistKind ?? null }));
  if (free.length === 0) return { ok: false, reason: "Η ώρα δεν είναι πια ελεύθερη." };

  const needed = neededKind(await neighbourKind(memberId, free[0].startsAt));
  const tried = new Set<string>();
  while (tried.size < free.length) {
    const pick = pickSlot(free.filter((x) => !tried.has(x.id)), needed);
    if (!pick) break;
    tried.add(pick.slot.id);
    try {
      const cycleId = await cycleForNewBooking(memberId, s);
      const booking = await prisma.$transaction(
        async (tx) => {
          const taken = await tx.booking.count({ where: { slotId: pick.slot.id } });
          if (taken >= capacity) throw new Error("FULL");
          return tx.booking.create({
            data: { slotId: pick.slot.id, memberId, cycleId, kind: pick.kind, alternationOk: pick.ok },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { ok: true, bookingId: booking.id };
    } catch (e) {
      // Κάποιος άλλος πρόλαβε τη θέση — δοκίμασε την επόμενη.
      if (e instanceof Error && e.message === "FULL") continue;
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034")) continue;
      throw e;
    }
  }
  return { ok: false, reason: "Η ώρα δεν είναι πια ελεύθερη." };
}

/** Μεταφέρει μια κράτηση σε άλλη ώρα (το κάνει η Εύα όταν εγκρίνει αίτημα αλλαγής). */
export async function moveBooking(bookingId: string, date: string, hour: number, kind: SlotKind): Promise<BookResult> {
  const old = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!old) return { ok: false, reason: "Η κράτηση δεν υπάρχει." };
  await prisma.booking.delete({ where: { id: bookingId } });
  const res = await bookHour({ memberId: old.memberId, date, hour, kind, byAdmin: true });
  if (!res.ok) {
    // Επαναφορά της παλιάς κράτησης.
    await prisma.booking.create({
      data: { id: old.id, slotId: old.slotId, memberId: old.memberId, cycleId: old.cycleId, kind: old.kind, alternationOk: old.alternationOk },
    });
  }
  return res;
}
