import "server-only";
import { assessmentFlags } from "./assessment-db";
import { z } from "zod";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { CASE_FIELDS, type CaseData, safetyFlags } from "./handover-rules";
import { memberIntake } from "./intake";
import { groupStarted, groupsOn } from "./program";
import { getSettings } from "./settings";
import { addDays, localParts } from "./time";

/** Σήματα ασφαλείας ενός μέλους (βλ. handover-rules.ts). Δεν διαβάζει το ημερολόγιο. */
export async function memberSafety(memberId: string, now = new Date()) {
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const since14 = new Date(now.getTime() - 14 * 24 * 3600_000);
  const [intake, plan, help, notes, attendance, booking, openDropout, s, missed] = await Promise.all([
    memberIntake(member),
    prisma.safetyPlan.findUnique({ where: { memberId }, select: { updatedAt: true } }),
    prisma.helpRequest.findMany({ where: { memberId, isDrill: false, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 3600_000) } }, select: { createdAt: true } }),
    prisma.sessionNote.findMany({
      where: { slot: { bookings: { some: { memberId } }, startsAt: { gte: new Date(now.getTime() - 30 * 24 * 3600_000) } } },
      select: { riskChange: true, usedSince: true, slotId: true, slot: { select: { startsAt: true } } },
    }),
    prisma.attendance.findFirst({ where: { memberId }, orderBy: { joinedAt: "desc" }, select: { joinedAt: true } }),
    prisma.booking.findFirst({ where: { memberId, joinedAt: { not: null } }, orderBy: { joinedAt: "desc" }, select: { joinedAt: true } }),
    prisma.careTask.count({ where: { memberId, kind: "dropout", doneAt: null } }),
    getSettings(),
    prisma.booking.findMany({
      where: { memberId, joinedAt: null, slot: { startsAt: { gte: since14, lt: new Date(now.getTime() - 3600_000) } } },
      select: { slotId: true, slot: { select: { startsAt: true } } },
    }),
  ]);
  const risk = intake.checks.find((c) => c.key === "risk");
  // Τελευταία επαφή από ομάδα ή ατομική (όχι από το ημερολόγιο, που το βλέπει μόνο η υπεύθυνη).
  const contacts = [attendance?.joinedAt, booking?.joinedAt].filter((d): d is Date => Boolean(d));
  const flags = safetyFlags({
    now,
    risk: risk ? { value: risk.value, at: risk.doneAt } : null,
    safetyPlanAt: plan?.updatedAt ?? null,
    helpRequests: help,
    notes: notes.map((n) => ({ at: n.slot.startsAt, riskChange: n.riskChange, usedSince: n.usedSince, slotId: n.slotId })),
    missed: missed.map((b) => ({ at: b.slot.startsAt, slotId: b.slotId })),
    lastContact: contacts.length ? new Date(Math.max(...contacts.map((d) => d.getTime()))) : null,
    openDropout: openDropout > 0,
    dropoutDays: s.dropoutDays,
    intakeComplete: intake.status.complete,
  });
  // Σοβαρά σημεία της αρχικής αξιολόγησης: μένουν όσο ισχύουν στην τελευταία της μορφή.
  const fromAssessment = (await assessmentFlags(memberId, now)).map((f) => ({ level: "red" as const, text: f.text, at: f.at, href: `/t/members/${memberId}/assessment` }));
  return [...fromAssessment, ...flags];
}

export type CaseVersion = { id: string; data: CaseData; author: string; at: Date };

export async function caseHistory(memberId: string, take = 20): Promise<CaseVersion[]> {
  const rows = await prisma.caseSummary.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take });
  const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, name: true } });
  return rows.map((r) => ({
    id: r.id,
    data: JSON.parse(dec(r.content)) as CaseData,
    author: authors.find((a) => a.id === r.authorId)?.name ?? "—",
    at: r.createdAt,
  }));
}

export async function saveCase(memberId: string, formData: FormData, authorId: string): Promise<void> {
  const data: CaseData = {};
  for (const f of CASE_FIELDS) data[f.key] = z.string().max(3000).parse(String(formData.get(f.key) ?? "")).trim();
  await prisma.caseSummary.create({ data: { memberId, authorId, content: enc(JSON.stringify(data)) } });
}

/** Συνέπεια των τελευταίων εβδομάδων: ομάδες (ανά μέρα) και ατομικές. */
export async function memberConsistency(memberId: string, weeks = 4, now = new Date()) {
  const s = await getSettings();
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true } });
  const today = localParts(now).date;
  const windowStart = addDays(today, -7 * weeks + 1);
  const from = member.programStartDate && member.programStartDate > windowStart ? member.programStartDate : windowStart;
  // Μέρες ομάδας στο διάστημα· η σημερινή μετράει μόνο αφού ξεκινήσει η ομάδα.
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (groupsOn(d, s).length === 0 || (d === today && !groupStarted(d, now, s))) continue;
    days.push(d);
  }
  const [att, bookings] = await Promise.all([
    prisma.attendance.findMany({ where: { memberId, date: { gte: from } }, select: { date: true } }),
    prisma.booking.findMany({ where: { memberId, slot: { date: { gte: from }, startsAt: { lt: now } } }, select: { joinedAt: true } }),
  ]);
  const present = new Set(att.map((a) => a.date));
  return {
    weeks,
    groupDays: days.map((date) => ({ date, present: present.has(date) })),
    groups: days.filter((d) => present.has(d)).length,
    sessionsDone: bookings.filter((b) => b.joinedAt).length,
    sessionsTotal: bookings.length,
  };
}
