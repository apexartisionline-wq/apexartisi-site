import "server-only";
import { prisma } from "./db";
import type { Settings } from "./settings";
import { addDays, isAfterLocal, localParts } from "./time";

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
  const done = cycle.bookings.filter((b) => b.slot.startsAt <= now).length;
  // Ομάδες του κύκλου: παρουσίες μέσα στην περίοδό του (όπως και στον φάκελο του μήνα).
  const { from, to } = cyclePeriod(cycle);
  const groups = await prisma.attendance.count({ where: { memberId, date: { gte: from, lte: to } } });
  return { cycle, length: cycle.length, done, booked: cycle.bookings.length, numbers, groups };
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
