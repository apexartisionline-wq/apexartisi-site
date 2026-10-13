import "server-only";
import { prisma } from "./db";
import { groupOccurrences } from "./groups";
import { memberGroups } from "./group-presence";
import { countPresence, sessionPresence } from "./presence";
import { getSettings, type Settings } from "./settings";
import { addDays, formatDate, isAfterLocal, localParts } from "./time";

/**
 * Η περίοδος ενός κύκλου («μήνας»), ίδια παντού (αρχική μέλους, φάκελος, μήνας, ανασκόπηση):
 * από την 1η ατομική του (ή τη δημιουργία του, αν δεν έχει ακόμα) έως την τελευταία ατομική του·
 * όσο ο κύκλος είναι ανοιχτός, έως σήμερα (αν είναι πιο αργά).
 */
export function cyclePeriod(cycle: { startedAt: Date; closedAt: Date | null; bookings: { slot: { date: string } }[] }) {
  const today = localParts(new Date()).date;
  const from = cycle.bookings[0]?.slot.date ?? localParts(cycle.startedAt).date;
  const last = cycle.bookings.at(-1)?.slot.date ?? today;
  const to = !cycle.closedAt && today > last ? today : last;
  return { from, to };
}

/**
 * Η περίοδος ως κείμενο. Ο ανοιχτός κύκλος (έχει ακόμα συνεδρίες που δεν έχουν γίνει, ή δεν έχει κλείσει) δεν εμφανίζεται
 * ως ολοκληρωμένη περίοδο «13/10–13/10»: λέει «Από 13/10 — σε εξέλιξη».
 */
export function cyclePeriodLabel(cycle: { startedAt: Date; closedAt: Date | null; bookings: { slot: { date: string; startsAt: Date } }[] }, now = new Date()): string {
  const { from, to } = cyclePeriod(cycle);
  const lastStart = cycle.bookings.at(-1)?.slot.startsAt;
  const inProgress = !cycle.closedAt || (lastStart ? lastStart > now : true);
  if (inProgress) return `Από ${formatDate(from)} — σε εξέλιξη`;
  return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

/**
 * Ο τρέχων κύκλος του μέλους (ο πιο πρόσφατος, ανοιχτός ή μόλις κλεισμένος) και
 * ο αριθμός κάθε συνεδρίας μέσα σε αυτόν.
 */
export async function cycleInfo(memberId: string) {
  const cycle = await prisma.cycle.findFirst({
    where: { memberId },
    orderBy: { startedAt: "desc" },
    include: { bookings: { include: { slot: true }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  if (!cycle) return null;
  const now = new Date();
  const numbers = new Map(cycle.bookings.map((b, i) => [b.id, i + 1]));
  const s = await getSettings();
  // Κοινός κανόνας (απόφαση 13/10): παρουσία = επιβεβαίωση θεραπευτή, αλλιώς πάτημα «Μπες» του μέλους («Από σύνδεση»)·
  // παρονομαστής = όσες προγραμματισμένες πέρασαν (έληξαν) ή έχουν ήδη καταγραφή.
  const presence = countPresence(cycle.bookings.map((b) => sessionPresence({
    startsAt: b.slot.startsAt,
    endsAt: new Date(b.slot.startsAt.getTime() + (b.slot.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000),
    now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame,
  })));
  const done = presence.timePassed;
  const attended = presence.counted;
  // Ομάδες του κύκλου: από το πραγματικό πρόγραμμα μέσα στην περίοδό του, μετά την ένταξη, όσες έληξαν και δεν ακυρώθηκαν.
  const { from, to } = cyclePeriod(cycle);
  const today = localParts(now).date;
  const [member, att] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true } }),
    prisma.attendance.findMany({ where: { memberId, date: { gte: from, lte: to } }, select: { date: true, joinedAt: true } }),
  ]);
  const occ = from <= today ? await groupOccurrences(from, to < today ? to : today, s, now) : [];
  const g = memberGroups(occ, att, { now, joinDate: member.programStartDate });
  const groups = g.counted;
  return { cycle, length: cycle.length, done, attended, booked: cycle.bookings.length, numbers, groups, groupsPassed: g.passed, groupsNoRecord: g.noRecord, presence, periodLabel: cyclePeriodLabel(cycle, now) };
}

type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Ο κύκλος στον οποίο μπαίνει μια νέα κράτηση — καλείται μέσα στη συναλλαγή της κράτησης.
 * Όταν ο κύκλος γεμίσει (8 ατομικές), κλείνει· η επόμενη κράτηση ανοίγει νέο κύκλο, που
 * μένει «εκκρεμεί τακτοποίηση» μέχρι να τον σημειώσει η Εύα. Ο πρώτος κύκλος ενός μέλους
 * θεωρείται τακτοποιημένος.
 */
export async function cycleForNewBooking(tx: Tx, memberId: string, s: Settings): Promise<string> {
  const latest = await tx.cycle.findFirst({
    where: { memberId },
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { bookings: true } } },
  });
  if (latest && !latest.closedAt && latest._count.bookings < latest.length) return latest.id;
  if (latest && !latest.closedAt) await tx.cycle.update({ where: { id: latest.id }, data: { closedAt: new Date() } });
  const c = await tx.cycle.create({
    data: { memberId, length: s.cycleLength, settledAt: latest ? null : new Date() },
  });
  return c.id;
}

/** Κλείνει τον κύκλο αν συμπληρώθηκε (καλείται μετά από νέα κράτηση). */
export async function closeCycleIfFull(tx: Tx, cycleId: string): Promise<void> {
  const c = await tx.cycle.findUnique({ where: { id: cycleId }, include: { _count: { select: { bookings: true } } } });
  if (c && !c.closedAt && c._count.bookings >= c.length) {
    await tx.cycle.update({ where: { id: cycleId }, data: { closedAt: new Date() } });
  }
}

/** Η μέρα στην οποία ανήκει το ημερολόγιο ανάκαμψης: απόψε μετά τις 20:00, αλλιώς χθες. */
export function journalDate(now: Date, s: Settings): string {
  const p = localParts(now);
  return isAfterLocal(p, s.journalTime) ? p.date : addDays(p.date, -1);
}

/** Περιεχόμενο που έχει ήδη «βγει» για το μέλος. */
export function isPublished(date: string, time: string, now: Date): boolean {
  const p = localParts(now);
  return date < p.date || (date === p.date && isAfterLocal(p, time));
}

/** «Συνεδρία Χ από Ν» για μια συγκεκριμένη κράτηση. */
export async function sessionNumber(booking: { cycleId: string | null; slot: { startsAt: Date } }) {
  if (!booking.cycleId) return null;
  const [n, cycle] = await Promise.all([
    prisma.booking.count({ where: { cycleId: booking.cycleId, slot: { startsAt: { lte: booking.slot.startsAt } } } }),
    prisma.cycle.findUnique({ where: { id: booking.cycleId } }),
  ]);
  return cycle ? `ατομική ${n} από ${cycle.length} του μήνα` : null;
}
