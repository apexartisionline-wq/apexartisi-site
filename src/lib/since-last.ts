import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { groupOccurrences } from "./groups";
import { memberGroups } from "./group-presence";
import { GOAL_CHECK, type GoalCheck } from "./goals";
import { getSettings } from "./settings";
import { addDays, athensToUtc, toMinutes } from "./time";

/**
 * «Από την προηγούμενη ατομική ως σήμερα»: τι έγινε ανάμεσα στις δύο ατομικές (π.χ. Πέμπτη → Τρίτη),
 * για τον θεραπευτή που μπαίνει. Μόνο μετρήσεις από όσα έχουν καταγραφεί — όχι AI, όχι ερμηνεία.
 */
export async function sinceLast(memberId: string, fromDate: string, untilDate: string, untilAt: Date = new Date()) {
  const s = await getSettings();
  // Μόνο ό,τι έγινε πριν από την ώρα της ατομικής (ή πριν από τώρα, αν δεν έχει γίνει ακόμα).
  const now = untilAt;
  const first = addDays(fromDate, 1);
  const last = addDays(untilDate, -1);
  const [groups, attended, journal, help, mentions, member] = await Promise.all([
    first <= untilDate ? groupOccurrences(first, untilDate, s) : Promise.resolve([]),
    prisma.attendance.findMany({ where: { memberId, date: { gte: first, lte: untilDate } }, select: { date: true, joinedAt: true } }),
    prisma.journalEntry.findMany({ where: { memberId, date: { gt: fromDate, lt: untilDate } }, orderBy: { date: "asc" } }),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: athensToUtc(first, 0), lt: athensToUtc(untilDate, 0) } } }),
    // «Προσοχή σε…» από τα σημειώματα ομάδας του διαστήματος.
    prisma.groupMention.findMany({
      where: { memberId, groupSession: { date: { gte: first, lte: untilDate } } },
      include: { groupSession: { select: { date: true, time: true, coordinator: { select: { name: true } } } } },
      orderBy: { groupSession: { date: "asc" } },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true } }),
  ]);
  // Ομάδες του πραγματικού προγράμματος (μετά την ένταξη) που είχαν ήδη γίνει ως την ατομική
  // — ίδιος κανόνας με φάκελο και Συνέπεια (απόφαση 13/10). Χωρίς παρουσία = «χωρίς καταγραφή», όχι απουσία.
  const g = memberGroups(groups, attended, { now, joinDate: member.programStartDate });
  const groupRows = g.rows
    .filter((r) => (r.state === "present" || r.state === "no_record") && r.startsAt < now)
    .map((r) => ({ date: r.date, time: r.time, came: r.state === "present" }));

  const days = first <= last ? Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) + 1 : 0;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const top = journal.length ? journal.reduce((a, b) => (b.craving > a.craving ? b : a)) : null;
  const goal = { YES: 0, PARTLY: 0, NO: 0 } as Record<GoalCheck, number>;
  // Από 25/10 η συνέπεια είναι στο GoalCheckIn (πατιέται στην κάρτα του στόχου).
  const checks = await prisma.goalCheckIn.findMany({ where: { memberId, date: { gt: fromDate, lt: untilDate } }, select: { check: true } });
  for (const c of checks) if (c.check in GOAL_CHECK) goal[c.check as GoalCheck]++;

  return {
    from: first,
    until: last,
    groups: groupRows,
    mentions: mentions
      .filter((m) => athensToUtc(m.groupSession.date, Math.floor(toMinutes(m.groupSession.time) / 60), toMinutes(m.groupSession.time) % 60) < now)
      .map((m) => ({ date: m.groupSession.date, time: m.groupSession.time, by: m.groupSession.coordinator?.name ?? "", text: dec(m.text) })),
    journal: {
      days,
      written: journal.length,
      mood: avg(journal.map((j) => j.mood)),
      craving: avg(journal.map((j) => j.craving)),
      sleep: avg(journal.map((j) => j.sleepHours)),
      confidence: avg(journal.map((j) => j.confidence)),
      topCraving: top && top.craving >= 6 ? { date: top.date, value: top.craving } : null,
      used: journal.filter((j) => j.used).map((j) => j.date),
      selfHarm: journal.filter((j) => j.selfHarm === "YES" || j.selfHarm === "UNSURE").map((j) => j.date),
      wins: journal.map((j) => ({ date: j.date, text: dec(j.win) })).filter((w) => w.text),
      goal,
    },
    help,
  };
}
