import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { addDays, mondayOf } from "./time";

// Στόχος της εβδομάδας (ιδέα της υπεύθυνης): ένας, τον γράφει το μέλος, από Δευτέρα.
// Κάθε βράδυ στο ημερολόγιο: «Σήμερα ήμουν συνεπής με τον στόχο μου;» — Ναι / Λίγο / Όχι σήμερα.
export const GOAL_CHECK = { YES: "Ναι", PARTLY: "Λίγο", NO: "Όχι σήμερα" } as const;
export type GoalCheck = keyof typeof GOAL_CHECK;

export async function weekGoal(memberId: string, date: string) {
  const week = mondayOf(date);
  const row = await prisma.weeklyGoal.findFirst({ where: { memberId, week }, orderBy: { createdAt: "desc" } });
  return row ? { week, text: dec(row.text), at: row.createdAt } : null;
}

export async function setWeekGoal(memberId: string, date: string, text: string) {
  await prisma.weeklyGoal.create({ data: { memberId, week: mondayOf(date), text: enc(text) } });
}

/** Ο στόχος και τα 7 τσεκαρίσματα (Δευτέρα–Κυριακή) μιας εβδομάδας. */
export async function goalWeek(memberId: string, date: string) {
  const week = mondayOf(date);
  const [goal, entries] = await Promise.all([
    weekGoal(memberId, week),
    prisma.journalEntry.findMany({ where: { memberId, date: { gte: week, lte: addDays(week, 6) } }, select: { date: true, goalCheck: true, goalNote: true } }),
  ]);
  const by = new Map(entries.map((e) => [e.date, e]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(week, i);
    const e = by.get(d);
    return { date: d, check: (e?.goalCheck ?? null) as GoalCheck | null, note: e ? dec(e.goalNote) : "" };
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
