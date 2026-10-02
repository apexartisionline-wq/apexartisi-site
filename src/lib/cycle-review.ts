import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { goalWeek } from "./goals";
import { soberDays } from "./note-form";
import { cyclePeriod } from "./member";
import { getSettings } from "./settings";
import { addDays, localParts, mondayOf } from "./time";


/** Ο τελευταίος κύκλος που έχει ολοκληρώσει όλες τις ατομικές του (όλες έγιναν). */
export async function lastFinishedCycle(memberId: string, now = new Date()) {
  const cycles = await prisma.cycle.findMany({
    where: { memberId },
    orderBy: { startedAt: "desc" },
    take: 3,
    include: { bookings: { include: { slot: { select: { startsAt: true, date: true } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  return cycles.find((c) => c.bookings.length >= c.length && c.bookings.every((b) => b.slot.startsAt <= now)) ?? null;
}

/** Η εικόνα του κύκλου, μόνη της: ατομικές, ομάδες, ημερολόγιο, στόχοι εβδομάδας, κόκκινο κουμπί, νηφαλιότητα. */
export async function cyclePicture(memberId: string, cycle: NonNullable<Awaited<ReturnType<typeof lastFinishedCycle>>>) {
  // Ο «μήνας» ξεκινά από την 1η ατομική του κύκλου (ή από τη δημιουργία του, αν δεν έχει ακόμα).
  const { from, to } = cyclePeriod(cycle);
  const [member, groups, journal, help, relapses, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true } }),
    prisma.attendance.count({ where: { memberId, date: { gte: from, lte: to } } }),
    prisma.journalEntry.count({ where: { memberId, date: { gte: from, lte: to } } }),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${addDays(to, 1)}T00:00:00Z`) } } }),
    prisma.sobrietyChange.count({ where: { memberId, at: { gte: new Date(`${from}T00:00:00Z`) } } }),
    getSettings(),
  ]);
  const days = Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const g = await goalWeek(memberId, w);
    if (g.goal) weeks.push({ week: w, text: g.goal.text, yes: g.days.filter((d) => d.check === "YES").length, partly: g.days.filter((d) => d.check === "PARTLY").length, no: g.days.filter((d) => d.check === "NO").length });
  }
  return {
    from,
    to,
    sessions: { came: cycle.bookings.filter((b) => b.joinedAt).length, total: cycle.length },
    groups: { came: groups, total: s.groupsPerCycle },
    journal: { written: journal, days },
    help,
    relapses,
    soberDays: soberDays(member.soberSince, to),
    weeks,
  };
}

export async function cycleReviews(memberId: string) {
  const rows = await prisma.cycleReview.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 12 });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, cycleId: r.cycleId, goals: dec(r.goals), memberSays: dec(r.memberSays), at: r.createdAt, author: names.get(r.authorId) ?? "" }));
}

export async function saveCycleReview(memberId: string, cycleId: string, authorId: string, goals: string, memberSays: string) {
  await prisma.cycleReview.create({ data: { memberId, cycleId, authorId, goals: enc(goals), memberSays: enc(memberSays) } });
}

/** Μέλη που τελείωσαν κύκλο χωρίς ανασκόπηση (για το «Να το δεις» όλης της ομάδας). */
export async function dueCycleReviews(memberIds: string[]) {
  const out: { memberId: string; cycleId: string }[] = [];
  for (const id of memberIds) {
    const c = await lastFinishedCycle(id);
    if (c && !(await prisma.cycleReview.findFirst({ where: { cycleId: c.id }, select: { id: true } }))) out.push({ memberId: id, cycleId: c.id });
  }
  return out;
}
