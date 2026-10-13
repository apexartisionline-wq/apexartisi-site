import "server-only";
import { assessmentFlags } from "./assessment-db";
import { riskTrigger } from "./risk-db";
import { z } from "zod";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { CASE_FIELDS, type CaseData, safetyFlags } from "./handover-rules";
import { memberIntake } from "./intake";
import { memberNotes } from "./member-notes";
import { groupOccurrences } from "./groups";
import { memberGroups } from "./group-presence";
import { getSettings } from "./settings";
import { countPresence, sessionPresence } from "./presence";
import { addDays, formatDate, localParts } from "./time";

/** Σήματα ασφάλειας ενός μέλους (βλ. handover-rules.ts). Δεν διαβάζει το ημερολόγιο. */
export async function memberSafety(memberId: string, now = new Date()) {
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const since14 = new Date(now.getTime() - 14 * 24 * 3600_000);
  const [intake, plan, help, notes, attendance, booking, openDropout, s, missed] = await Promise.all([
    memberIntake(member),
    prisma.safetyPlan.findUnique({ where: { memberId }, select: { updatedAt: true } }),
    prisma.helpRequest.findMany({ where: { memberId, isDrill: false, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 3600_000) } }, select: { createdAt: true } }),
    memberNotes(memberId, { since: new Date(now.getTime() - 30 * 24 * 3600_000) }),
    prisma.attendance.findFirst({ where: { memberId }, orderBy: { joinedAt: "desc" }, select: { joinedAt: true } }),
    // Τελευταία επαφή από ατομική: παρουσία (επιβεβαίωση «Ήρθε» ή πάτημα «Μπες» χωρίς «Δεν ήρθε»).
    prisma.booking.findMany({ where: { memberId, OR: [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }] }, orderBy: { slot: { startsAt: "desc" } }, take: 1, select: { joinedAt: true, confirmedCame: true, slot: { select: { startsAt: true } } } }).then((r) => r[0] ? { joinedAt: r[0].joinedAt ?? r[0].slot.startsAt } : null),
    prisma.careTask.count({ where: { memberId, kind: "dropout", doneAt: null } }),
    getSettings(),
    prisma.booking.findMany({
      // Ατομικές χωρίς παρουσία: επιβεβαιωμένη απουσία, ή χωρίς καταγραφή (ούτε πάτημα ούτε επιβεβαίωση).
      where: { memberId, OR: [{ confirmedCame: false }, { confirmedCame: null, joinedAt: null }], slot: { startsAt: { gte: since14, lt: new Date(now.getTime() - 3600_000) } } },
      select: { slotId: true, confirmedCame: true, slot: { select: { startsAt: true } } },
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
    missed: missed.map((b) => ({ at: b.slot.startsAt, slotId: b.slotId, noted: b.confirmedCame === false })),
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
    text: `Έγραψε στο ημερολόγιο (${formatDate(j.date)}): ${[j.used && "έκανε χρήση", (j.selfHarm === "YES" || j.selfHarm === "UNSURE") && "σκέψεις να κάνει κακό στον εαυτό του"].filter(Boolean).join(" · ")}`,
    at: j.updatedAt,
    href: `/t/members/${memberId}`,
  }));
  const trig = await riskTrigger(memberId);
  const review = trig ? [{ level: "yellow" as const, key: "risk_review", trigText: trig.text, text: `Θέλει αξιολόγηση αναγκών ασφάλειας (μετά από ${trig.text})`, at: trig.at, href: `/t/members/${memberId}/risk` }] : [];
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

/**
 * Συνέπεια των τελευταίων εβδομάδων: ομάδες και ατομικές, με τον κοινό κανόνα (απόφαση 13/10):
 * ομάδες = πραγματικό πρόγραμμα, μετά την ένταξη, όσες έληξαν και δεν ακυρώθηκαν· ατομικές = όσες προγραμματισμένες πέρασαν.
 * Παρουσία ατομικής: επιβεβαίωση θεραπευτή, αλλιώς πάτημα «Μπες» του μέλους («Από σύνδεση»).
 */
export async function memberConsistency(memberId: string, weeks = 4, now = new Date()) {
  const s = await getSettings();
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true } });
  const today = localParts(now).date;
  const windowStart = addDays(today, -7 * weeks + 1);
  const from = member.programStartDate && member.programStartDate > windowStart ? member.programStartDate : windowStart;
  const [occ, att, bookings] = await Promise.all([
    groupOccurrences(from, today, s, now),
    prisma.attendance.findMany({ where: { memberId, date: { gte: from } }, select: { date: true, joinedAt: true } }),
    prisma.booking.findMany({ where: { memberId, slot: { date: { gte: from }, startsAt: { lte: now } } }, select: { joinedAt: true, confirmedCame: true, slot: { select: { startsAt: true, kind: true } } } }),
  ]);
  const g = memberGroups(occ, att, { now, joinDate: member.programStartDate });
  const counted = g.rows.filter((r) => r.state === "present" || r.state === "no_record");
  const sessions = countPresence(bookings.map((b) => sessionPresence({
    startsAt: b.slot.startsAt,
    endsAt: new Date(b.slot.startsAt.getTime() + (b.slot.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000),
    now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame,
  })));
  return {
    weeks,
    // Μία γραμμή ανά ομάδα του προγράμματος που μετράει (παρουσία ή χωρίς καταγραφή).
    groupDays: counted.map((r) => ({ date: r.date, time: r.time, present: r.state === "present" })),
    groups: g.counted,
    groupsPassed: g.passed,
    groupsNoRecord: g.noRecord,
    // Παρουσίες ατομικών / προγραμματισμένες που πέρασαν.
    sessionsDone: sessions.counted,
    sessionsTotal: sessions.timePassed,
    sessions,
    from,
  };
}
