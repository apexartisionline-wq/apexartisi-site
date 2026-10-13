import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { buildActions, type ItemRow, type CareRow, type HelpRowIn } from "./actions-core";
import { lastFinishedCycle } from "./cycle-review";

/** Οι εγγραφές ανάληψης των μελών (ανοιχτές και όσες ολοκληρώθηκαν τις τελευταίες 14 μέρες). */
export async function fetchItemRows(memberIds: string[], now = new Date()): Promise<ItemRow[]> {
  if (memberIds.length === 0) return [];
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await prisma.actionItem.findMany({ where: { memberId: { in: memberIds }, OR: [{ doneAt: null }, { doneAt: { gte: since } }] } });
  return rows.map((r) => ({ ...r, doneNote: r.doneNote ? dec(r.doneNote) : "" }));
}

/** Ανοιχτά μηνύματα φροντίδας. Οι «dropout» και «risk_contact» τα παίρνει τηλέφωνο η διαχείριση. */
export async function fetchCare(memberIds: string[], opts: { includeAdminKinds?: boolean } = {}): Promise<(CareRow & { memberId: string })[]> {
  if (memberIds.length === 0) return [];
  const rows = await prisma.careTask.findMany({
    where: { memberId: { in: memberIds }, doneAt: null, ...(opts.includeAdminKinds ? {} : { kind: { notIn: ["dropout", "risk_contact"] } }) },
    orderBy: { dueAt: "asc" },
  });
  const doneIds = [...new Set(rows.map((r) => r.doneById).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: doneIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    memberId: r.memberId, id: r.id, kind: r.kind, dueAt: r.dueAt, createdAt: r.createdAt, doneAt: r.doneAt,
    doneByName: r.doneById ? (names.get(r.doneById) ?? null) : null, claimedByName: r.claimedByName, claimedAt: r.claimedAt, note: r.note ? dec(r.note) : "",
  }));
}

/** Ανοιχτά κόκκινα κουμπιά (χωρίς δοκιμές): δεν κλείνουν επειδή πέρασαν 24 ώρες. */
export async function fetchOpenHelp(memberIds: string[]): Promise<(HelpRowIn & { memberId: string })[]> {
  if (memberIds.length === 0) return [];
  const rows = await prisma.helpRequest.findMany({ where: { memberId: { in: memberIds }, isDrill: false, resolvedAt: null, talkedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.map((h) => ({ memberId: h.memberId, id: h.id, createdAt: h.createdAt, claimedByName: h.claimedByName, claimedAt: h.claimedAt, talkedAt: h.talkedAt }));
}

/** Πρόσφατα ολοκληρωμένα (14 μέρες) ενός μέλους: ποιος και πότε. */
export async function recentlyDone(memberId: string, now = new Date()): Promise<{ title: string; by: string | null; at: Date }[]> {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const [items, care, help, risk, reviews] = await Promise.all([
    prisma.actionItem.findMany({ where: { memberId, doneAt: { gte: since } } }),
    prisma.careTask.findMany({ where: { memberId, doneAt: { gte: since } } }),
    prisma.helpRequest.findMany({ where: { memberId, isDrill: false, talkedAt: { gte: since } } }),
    prisma.riskReview.findMany({ where: { memberId, createdAt: { gte: since } } }),
    prisma.cycleReview.findMany({ where: { memberId, createdAt: { gte: since } } }),
  ]);
  const ids = [...new Set([...care.map((c) => c.doneById), ...risk.map((r) => r.authorId), ...reviews.map((r) => r.authorId)].filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const KIND: Record<string, string> = { signal_followup: "Παρακολούθηση ανοιχτών σημάτων", safety_assessment: "Αξιολόγηση αναγκών ασφάλειας", initial_assessment: "Αρχική αξιολόγηση", cycle_review: "Ανασκόπηση κύκλου" };
  return [
    ...items.filter((r) => r.doneAt).map((r) => ({ title: KIND[r.kind] ?? r.kind, by: r.doneByName, at: r.doneAt as Date })),
    ...care.filter((c) => c.doneAt).map((c) => ({ title: "Μήνυμα φροντίδας / επικοινωνία", by: c.doneById ? (names.get(c.doneById) ?? null) : null, at: c.doneAt as Date })),
    ...help.filter((h) => h.talkedAt).map((h) => ({ title: "Κόκκινο κουμπί: μίλησαν", by: h.claimedByName, at: h.talkedAt as Date })),
    ...risk.map((r) => ({ title: "Αξιολόγηση αναγκών ασφάλειας", by: names.get(r.authorId) ?? null, at: r.createdAt })),
    ...reviews.map((r) => ({ title: "Ανασκόπηση κύκλου", by: names.get(r.authorId) ?? null, at: r.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

type Flags = { level: string; key?: string; text: string; at?: Date | null; trigText?: string }[];

/**
 * Οι ανοιχτές ενέργειες ενός μέλους (φάκελος, σελίδα ατομικής): από τα σήματα που ήδη υπολογίζονται, τα μηνύματα φροντίδας,
 * το κόκκινο κουμπί, την ανασκόπηση κύκλου και την αρχική αξιολόγηση, μαζί με την ανάληψη και την ολοκλήρωση.
 */
export async function loadMemberActions(memberId: string, memberName: string, flags: Flags, opts: { now?: Date; includeAdminCare?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const [itemRows, care, help, member, assessed, finished] = await Promise.all([
    fetchItemRows([memberId], now),
    fetchCare([memberId], { includeAdminKinds: opts.includeAdminCare }),
    fetchOpenHelp([memberId]),
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { createdAt: true, programStartDate: true } }),
    prisma.intakeCheck.findFirst({ where: { memberId, key: "assessment" }, select: { doneAt: true } }),
    lastFinishedCycle(memberId, now),
  ]);
  const reviewDone = finished ? await prisma.cycleReview.findFirst({ where: { cycleId: finished.id }, select: { id: true } }) : null;
  let lastTherapist: string | null = null;
  let since: Date | null = null;
  if (finished && !reviewDone) {
    const last = await prisma.booking.findFirst({ where: { cycleId: finished.id }, orderBy: { slot: { startsAt: "desc" } }, select: { slot: { select: { startsAt: true, therapist: { select: { name: true } } } } } });
    lastTherapist = last?.slot.therapist?.name ?? null;
    since = last?.slot.startsAt ?? null;
  }
  const rr = flags.find((x) => x.key === "risk_review");
  return buildActions({
    memberId, memberName,
    riskTrigger: rr?.at ? { at: rr.at, text: rr.trigText ?? "νέα αφορμή" } : null,
    redSignals: flags.filter((x) => x.level === "red").map((x) => ({ text: x.text, at: x.at })),
    initialAssessmentMissing: assessed ? null : { detail: "δεν έχει γίνει ακόμα", since: member.programStartDate ? new Date(`${member.programStartDate}T00:00:00Z`) : member.createdAt },
    cycleReviewDue: finished && !reviewDone ? { cycleId: finished.id, lastTherapist, since } : null,
    care: care.filter((c) => c.dueAt <= now),
    help,
    items: itemRows,
  });
}
