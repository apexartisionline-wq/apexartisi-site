import "server-only";
import { prisma } from "./db";
import type { Settings } from "./settings";
import { addDays, isAfterLocal, localParts } from "./time";

/** Ο ανοιχτός κύκλος του μέλους και ο αριθμός κάθε συνεδρίας μέσα σε αυτόν. */
export async function cycleInfo(memberId: string) {
  const cycle = await prisma.cycle.findFirst({
    where: { memberId, closedAt: null },
    orderBy: { startedAt: "desc" },
    include: { bookings: { include: { slot: true }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  if (!cycle) return null;
  const now = new Date();
  const numbers = new Map(cycle.bookings.map((b, i) => [b.id, i + 1]));
  const done = cycle.bookings.filter((b) => b.slot.startsAt <= now).length;
  // Ομάδες του κύκλου: παρουσίες από την έναρξή του.
  const groups = await prisma.attendance.count({
    where: { memberId, date: { gte: localParts(cycle.startedAt).date } },
  });
  return { cycle, length: cycle.length, done, booked: cycle.bookings.length, numbers, groups };
}

/**
 * Ο κύκλος στον οποίο μπαίνει μια νέα κράτηση. Όταν γεμίσει (8 ατομικές), ανοίγει
 * νέος μόνος του και μένει «εκκρεμεί τακτοποίηση» μέχρι να τον σημειώσει η Εύα.
 */
export async function cycleForNewBooking(memberId: string, s: Settings): Promise<string> {
  const info = await cycleInfo(memberId);
  if (info && info.booked < info.length) return info.cycle.id;
  if (info) await prisma.cycle.update({ where: { id: info.cycle.id }, data: { closedAt: new Date() } });
  const first = !info && (await prisma.cycle.count({ where: { memberId } })) === 0;
  const c = await prisma.cycle.create({
    data: { memberId, length: s.cycleLength, settledAt: first ? new Date() : null },
  });
  return c.id;
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
  return cycle ? `συνεδρία ${n} από ${cycle.length}` : null;
}
