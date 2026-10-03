import "server-only";
import { assessmentFlags } from "./assessment-db";
import { riskTrigger } from "./risk-db";
import { z } from "zod";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { CASE_FIELDS, type CaseData, safetyFlags } from "./handover-rules";
import { memberIntake } from "./intake";
import { memberNotes } from "./member-notes";
import { groupStarted, groupsOn } from "./program";
import { getSettings } from "./settings";
import { addDays, formatDate, localParts } from "./time";

/** Σήματα ασφαλείας ενός μέλους (βλ. handover-rules.ts). Δεν διαβάζει το ημερολόγιο. */
export async function memberSafety(memberId: string, now = new Date()) {
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const since14 = new Date(now.getTime() - 14 * 24 * 3600_000);
  const [intake, plan, help, notes, attendance, booking, openDropout, s, missed] = await Promise.all([
    memberIntake(member),
    prisma.safetyPlan.findUnique({ where: { memberId }, select: { updatedAt: true } }),
    prisma.helpRequest.findMany({ where: { memberId, isDrill: false, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 3600_000) } }, select: { createdAt: true } }),
    memberNotes(memberId, { since: new Date(now.getTime() - 30 * 24 * 3600_000) }),
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
  // Τελευταία επαφή από ομάδα ή ατομική.
  const contacts = [attendance?.joinedAt, booking?.joinedAt].filter((d): d is Date => Boolean(d));
  const flags = safetyFlags({
    now,
    risk: risk ? { value: risk.value, at: risk.doneAt } : null,
    safetyPlanAt: plan?.updatedAt ?? null,
    helpRequests: help,
    notes: notes.map((n) => ({ at: n.startsAt, riskChange: n.riskChange, usedSince: n.usedSince, slotId: n.slotId })),
    missed: missed.map((b) => ({ at: b.slot.startsAt, slotId: b.slotId })),
    lastContact: contacts.length ? new Date(Math.max(...contacts.map((d) => d.getTime()))) : null,
    openDropout: openDropout > 0,
    dropoutDays: s.dropoutDays,
    intakeComplete: intake.status.complete,
  });
  // Σοβαρά σημεία της αρχικής αξιολόγησης: μένουν όσο ισχύουν στην τελευταία της μορφή.
  const fromAssessment = (await assessmentFlags(memberId, now)).map((f) => ({ level: (f.kind === "PREGNANCY" ? "yellow" : "red") as "red" | "yellow", key: `assessment_${f.kind}`, text: f.text, at: f.at, href: `/t/members/${memberId}/assessment` }));
  // Ό,τι τσέκαρε το μέλος στο ημερολόγιο ότι «θέλει να ξέρει η ομάδα» (τελευταίες 7 μέρες): μία γραμμή, χωρίς το κείμενο.
  const journal = await prisma.journalEntry.findMany({
    where: { memberId, date: { gte: localParts(new Date(now.getTime() - 7 * 86_400_000)).date }, OR: [{ used: true }, { selfHarm: { in: ["YES", "UNSURE"] } }] },
    select: { date: true, used: true, selfHarm: true, updatedAt: true },
    orderBy: { date: "desc" },
  });
  const fromJournal = journal.map((j) => ({
    level: "red" as const,
    key: `journal_${j.date}`,
    text: `Έγραψε στο ημερολόγιο (${formatDate(j.date)}): ${[j.used && "έκανε χρήση", (j.selfHarm === "YES" || j.selfHarm === "UNSURE") && "σκέψεις να κάνει κακό στον εαυτό του/της"].filter(Boolean).join(" · ")}`,
    at: j.updatedAt,
    href: `/t/members/${memberId}`,
  }));
  const trig = await riskTrigger(memberId);
  const review = trig ? [{ level: "yellow" as const, key: "risk_review", text: `Θέλει αξιολόγηση αναγκών ασφάλειας (μετά από ${trig.text})`, at: trig.at, href: `/t/members/${memberId}/risk` }] : [];
  // Τα κόκκινα πρώτα (η εγκυμοσύνη είναι κίτρινη).
  const all = [...fromAssessment, ...fromJournal, ...review, ...flags];
  return [...all.filter((f) => f.level === "red"), ...all.filter((f) => f.level !== "red")];
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
