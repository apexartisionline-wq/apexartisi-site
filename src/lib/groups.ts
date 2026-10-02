import "server-only";
import { prisma } from "./db";
import { groupsOn, rotationCoordinator } from "./program";
import type { Settings } from "./settings";
import { addDays } from "./time";

export type GroupDay = {
  date: string;
  time: string;
  coordinatorId: string | null;
  overridden: boolean;
  sessionId: string | null;
  hasNote: boolean;
};

/**
 * Οι ομάδες ενός διαστήματος με τον συντονιστή τους: από τη σταθερή εναλλαγή,
 * εκτός αν η Εύα τον άλλαξε για τη συγκεκριμένη μέρα (εκτός απροόπτου).
 */
export async function groupDays(from: string, to: string, s: Settings): Promise<GroupDay[]> {
  const rows = await prisma.groupSession.findMany({ where: { date: { gte: from, lte: to } } });
  const byKey = new Map(rows.map((r) => [`${r.date} ${r.time}`, r]));
  const out: GroupDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const g of groupsOn(d, s)) {
      const row = byKey.get(`${d} ${g.time}`);
      const rotated = rotationCoordinator(g, d, s);
      out.push({
        date: d,
        time: g.time,
        coordinatorId: row?.coordinatorId ?? rotated,
        overridden: Boolean(row?.coordinatorId && row.coordinatorId !== rotated),
        sessionId: row?.id ?? null,
        hasNote: Boolean(row?.noteAt),
      });
    }
  }
  return out;
}

/** Η εγγραφή μιας ομάδας (δημιουργείται όταν χρειαστεί: αλλαγή συντονιστή ή σημείωμα). */
export async function ensureGroupSession(date: string, time: string) {
  return prisma.groupSession.upsert({
    where: { date_time: { date, time } },
    create: { date, time },
    update: {},
  });
}
