import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { memberNotes } from "./member-notes";
import { memberConsistency } from "./handover";
import { cycleInfo } from "./member";
import { soberDays } from "./note-form";
import { addDays, localParts } from "./time";

export type JournalDay = { date: string; craving: number; sleep: number; mood: number } | null;

/** Όσα χρειάζεται ο θεραπευτής «με μια ματιά» πριν/κατά την ατομική. */
export async function sessionGlance(memberId: string, beforeSlot: { id: string; startsAt: Date }) {
  const now = new Date();
  const today = localParts(now).date;
  const from7 = addDays(today, -6);
  const [member, cycle, consistency, help14, prev, journal, assignment, forms] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true, soberSince: true } }),
    cycleInfo(memberId),
    memberConsistency(memberId, 4, now),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } }),
    // Το προηγούμενο σημείωμα (άλλης συνεδρίας) για «ανοιχτό από την προηγούμενη φορά».
    memberNotes(memberId, { before: beforeSlot.startsAt, excludeSlot: beforeSlot.id, take: 1 }).then((ns) => ns[0] ?? null),
    prisma.journalEntry.findMany({ where: { memberId, date: { gte: from7, lte: today } }, select: { date: true, craving: true, sleepHours: true, mood: true } }),
    prisma.assignment.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, answer: true, answeredAt: true } }),
    // Φόρμες της θεματικής αυτής της εβδομάδας (Δευτέρα–Κυριακή).
    prisma.content.findMany({ where: { kind: "FORM", date: { gte: mondayOf(today), lte: addDays(mondayOf(today), 6) } }, orderBy: { date: "asc" }, select: { title: true } }),
  ]);

  const byDate = new Map(journal.map((j) => [j.date, j]));
  const days: JournalDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from7, i);
    const j = byDate.get(d);
    return j ? { date: d, craving: j.craving, sleep: j.sleepHours, mood: j.mood } : null;
  });
  const written = days.filter(Boolean) as Exclude<JournalDay, null>[];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

  return {
    soberSince: member.soberSince,
    soberDays: soberDays(member.soberSince, today),
    cycle: cycle ? { done: cycle.done, length: cycle.length, groups: cycle.groups } : null,
    groups: { done: consistency.groups, total: consistency.groupDays.length },
    sessions: { done: consistency.sessionsDone, total: consistency.sessionsTotal },
    help14,
    prev: prev
      ? { by: prev.therapist, date: prev.date, next: prev.next, slotId: prev.slotId }
      : null,
    journal: {
      days,
      fromDate: from7,
      written: written.length,
      craving: avg(written.map((d) => d.craving)),
      sleep: avg(written.map((d) => d.sleep)),
      mood: avg(written.map((d) => d.mood)),
    },
    assignment: assignment ? { id: assignment.id, title: assignment.title, answered: Boolean(assignment.answeredAt), length: dec(assignment.answer).length } : null,
    forms: forms.map((f, i) => `Φόρμα ${i + 1} · ${f.title}`).slice(0, 3),
  };
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // Δευτέρα = 0
  return addDays(date, -wd);
}
