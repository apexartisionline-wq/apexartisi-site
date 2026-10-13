import "server-only";
import { prisma } from "./db";
import { groupsOn, rotationCoordinator } from "./program";
import type { Occurrence } from "./group-presence";
import type { Settings } from "./settings";
import { addDays, athensToUtc, localParts } from "./time";

export type GroupDay = {
  date: string;
  time: string;
  coordinatorId: string | null;
  overridden: boolean;
  sessionId: string | null;
  hasNote: boolean;
};

/**
 * Πραγματικό πρόγραμμα ομάδων (απόφαση 13/10): κάθε ομάδα γράφεται ως γεγονός (GroupSession) μέχρι και σήμερα, από το εβδομαδιαίο
 * πρόγραμμα των Ρυθμίσεων όπως ίσχυε εκείνη τη μέρα. Έτσι μια μεταγενέστερη αλλαγή στις Ρυθμίσεις δεν αλλάζει το παρελθόν.
 * Την πρώτη φορά, για το διάστημα πριν υπάρξει αποθηκευμένο πρόγραμμα, χρησιμοποιείται το τρέχον εβδομαδιαίο πρόγραμμα
 * (υπόθεση: δεν άλλαξε στο μεταξύ — τεκμηριώνεται στην αναφορά 13/10).
 */
export async function syncGroupProgramme(s: Settings, now = new Date()): Promise<void> {
  const today = localParts(now).date;
  const last = await prisma.groupSession.findFirst({ where: { fromProgramme: true }, orderBy: { date: "desc" }, select: { date: true } });
  if (last && last.date >= today) return;
  let start = last ? addDays(last.date, 1) : null;
  if (!start) {
    const first = await prisma.user.findFirst({ where: { role: "MEMBER", programStartDate: { not: null } }, orderBy: { programStartDate: "asc" }, select: { programStartDate: true } });
    start = first?.programStartDate && first.programStartDate > addDays(today, -400) ? first.programStartDate : addDays(today, -120);
  }
  const rows: { date: string; time: string; fromProgramme: boolean }[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) for (const g of groupsOn(d, s)) rows.push({ date: d, time: g.time, fromProgramme: true });
  if (rows.length === 0) return;
  await prisma.groupSession.createMany({ data: rows, skipDuplicates: true });
  // Όσες υπήρχαν ήδη (αλλαγή συντονιστή, σημείωμα) σημειώνονται κι αυτές ως μέρος του προγράμματος.
  await prisma.groupSession.updateMany({ where: { fromProgramme: false, OR: rows.map((r) => ({ date: r.date, time: r.time })) }, data: { fromProgramme: true } });
}

/**
 * Οι ομάδες ενός διαστήματος από το πραγματικό πρόγραμμα: μέχρι σήμερα όσες είναι γραμμένες ως γεγονότα,
 * μετά από σήμερα το εβδομαδιαίο πρόγραμμα (και ό,τι έχει ήδη γραφτεί). Οι ομάδες δεν ακυρώνονται ποτέ (υπεύθυνη 13/10).
 */
export async function groupOccurrences(from: string, to: string, s: Settings, now = new Date()): Promise<(Occurrence & { sessionId: string | null; coordinatorId: string | null; noteAt: Date | null })[]> {
  await syncGroupProgramme(s, now);
  const today = localParts(now).date;
  const rows = await prisma.groupSession.findMany({ where: { date: { gte: from, lte: to } } });
  const byKey = new Map(rows.map((r) => [`${r.date} ${r.time}`, r]));
  const make = (date: string, time: string) => {
    const [h, m] = time.split(":").map(Number);
    const startsAt = athensToUtc(date, h, m);
    const r = byKey.get(`${date} ${time}`);
    return { date, time, startsAt, endsAt: new Date(startsAt.getTime() + s.groupDurationMinutes * 60_000), sessionId: r?.id ?? null, coordinatorId: r?.coordinatorId ?? null, noteAt: r?.noteAt ?? null };
  };
  const out = [];
  for (const r of rows) if (r.date <= today) out.push(make(r.date, r.time));
  for (let d = today > from ? addDays(today, 1) : from; d <= to; d = addDays(d, 1)) {
    if (d <= today) continue;
    const times = new Set(groupsOn(d, s).map((g) => g.time));
    for (const r of rows) if (r.date === d) times.add(r.time); // ομάδα που έχει ήδη γραφτεί (π.χ. αλλαγή συντονιστή)
    for (const t of times) out.push(make(d, t));
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Οι ομάδες ενός διαστήματος με τον συντονιστή τους: από τη σταθερή εναλλαγή,
 * εκτός αν η Εύα τον άλλαξε για τη συγκεκριμένη μέρα (εκτός απροόπτου).
 */
export async function groupDays(from: string, to: string, s: Settings): Promise<GroupDay[]> {
  const occ = await groupOccurrences(from, to, s);
  return occ.map((o) => {
    const rotated = rotationCoordinator({ weekday: 0, time: o.time, rotation: (groupsOn(o.date, s).find((g) => g.time === o.time)?.rotation ?? []) }, o.date, s);
    return {
      date: o.date,
      time: o.time,
      coordinatorId: o.coordinatorId ?? rotated,
      overridden: Boolean(o.coordinatorId && o.coordinatorId !== rotated),
      sessionId: o.sessionId,
      hasNote: Boolean(o.noteAt),
    };
  });
}

/** Η εγγραφή μιας ομάδας (δημιουργείται όταν χρειαστεί: αλλαγή συντονιστή ή σημείωμα). */
/** Οι ώρες ομάδων μιας μέρας που ΔΕΝ είναι στο εβδομαδιαίο πρόγραμμα (έκτακτες, π.χ. σε αργία). */
export async function extraGroupTimes(date: string, s: Settings): Promise<string[]> {
  const regular = new Set(groupsOn(date, s).map((g) => g.time));
  const rows = await prisma.groupSession.findMany({ where: { date }, select: { time: true } });
  return rows.map((r) => r.time).filter((t) => !regular.has(t)).sort();
}

/** Αργίες από μια μέρα και μετά (για το «Σήμερα» μέλους/θεραπευτή και τις κρατήσεις). */
export async function holidaysFrom(from: string, to: string) {
  return prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
}

export async function ensureGroupSession(date: string, time: string) {
  return prisma.groupSession.upsert({
    where: { date_time: { date, time } },
    create: { date, time },
    update: {},
  });
}
