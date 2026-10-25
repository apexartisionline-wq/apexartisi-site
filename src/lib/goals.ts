import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { addDays, mondayOf } from "./time";

// Στόχος της εβδομάδας (ιδέα της υπεύθυνης): ένας, τον γράφει το μέλος, από Δευτέρα.
// Κάθε μέρα, πάνω στην κάρτα του στόχου (25/10, πριν ήταν κρυμμένο μέσα στο ημερολόγιο): «Σήμερα ήμουν συνεπής με τον
// στόχο μου;» — Ναι / Λίγο / Όχι σήμερα. Αποθηκεύεται στο GoalCheckIn (μία ανά ημερολογιακή μέρα).
export const GOAL_CHECK = { YES: "Ναι", PARTLY: "Λίγο", NO: "Όχι σήμερα" } as const;
export type GoalCheck = keyof typeof GOAL_CHECK;

export async function weekGoal(memberId: string, date: string) {
  const week = mondayOf(date);
  const row = await prisma.weeklyGoal.findFirst({ where: { memberId, week }, orderBy: { createdAt: "desc" } });
  return row ? { week, text: dec(row.text), at: row.createdAt } : null;
}

export async function setGoalCheck(memberId: string, date: string, check: GoalCheck) {
  await prisma.goalCheckIn.upsert({ where: { memberId_date: { memberId, date } }, create: { memberId, date, check }, update: { check } });
}

/** Οι απαντήσεις συνέπειας πολλών μελών σε ένα διάστημα: κλειδί `${memberId}|${date}`. */
export async function goalChecksFor(memberIds: string[], from: string, to: string) {
  const rows = memberIds.length ? await prisma.goalCheckIn.findMany({ where: { memberId: { in: memberIds }, date: { gte: from, lte: to } } }) : [];
  return new Map(rows.map((r) => [`${r.memberId}|${r.date}`, { memberId: r.memberId, date: r.date, check: r.check as GoalCheck, note: dec(r.note) }]));
}

export async function setWeekGoal(memberId: string, date: string, text: string) {
  await prisma.weeklyGoal.create({ data: { memberId, week: mondayOf(date), text: enc(text) } });
}

/** Ο στόχος και τα 7 τσεκαρίσματα (Δευτέρα–Κυριακή) μιας εβδομάδας. */
export async function goalWeek(memberId: string, date: string) {
  const week = mondayOf(date);
  const [goal, checks] = await Promise.all([weekGoal(memberId, week), goalChecksFor([memberId], week, addDays(week, 6))]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(week, i);
    const e = checks.get(`${memberId}|${d}`);
    return { date: d, check: e?.check ?? null, note: e?.note ?? "" };
  });
  return { week, goal, days };
}

/** Οι στόχοι των τελευταίων εβδομάδων, για τον φάκελο. */
export async function recentGoals(memberId: string, today: string, weeks = 4) {
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const w = await goalWeek(memberId, addDays(mondayOf(today), -7 * i));
    if (w.goal) out.push(w);
  }
  return out;
}
