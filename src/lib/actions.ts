import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { ADMIN_CARE, buildActions, type ItemRow, type CareRow, type HelpRowIn } from "./actions-core";
import { AUTO_AUTHOR, lastFinishedCycle } from "./cycle-review";

/** Οι εγγραφές ανάληψης των μελών (ανοιχτές και όσες ολοκληρώθηκαν τις τελευταίες 14 μέρες). */
export async function fetchItemRows(memberIds: string[], now = new Date()): Promise<ItemRow[]> {
  if (memberIds.length === 0) return [];
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await prisma.actionItem.findMany({ where: { memberId: { in: memberIds }, OR: [{ doneAt: null }, { doneAt: { gte: since } }] } });
  return rows.map((r) => ({ ...r, doneNote: r.doneNote ? dec(r.doneNote) : "" }));
}

/** Ανοιχτά μηνύματα φροντίδας. Οι ενέργειες της διαχείρισης (τηλεφωνήματα, νέος κύκλος) μόνο με includeAdminKinds (= διαχείριση). */
export async function fetchCare(memberIds: string[], opts: { includeAdminKinds?: boolean } = {}): Promise<(CareRow & { memberId: string })[]> {
  if (memberIds.length === 0) return [];
  const rows = await prisma.careTask.findMany({
    where: { memberId: { in: memberIds }, doneAt: null, ...(opts.includeAdminKinds ? {} : { kind: { notIn: [...ADMIN_CARE] } }) },
    orderBy: { dueAt: "asc" },
  });
  const doneIds = [...new Set(rows.map((r) => r.doneById).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: doneIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    memberId: r.memberId, id: r.id, kind: r.kind, dueAt: r.dueAt, createdAt: r.createdAt, doneAt: r.doneAt,
    doneByName: r.doneById ? (names.get(r.doneById) ?? null) : null, claimedByName: r.claimedByName, claimedAt: r.claimedAt, note: r.note ? dec(r.note) : "",
  }));
}

/**
 * Βήματα/εργασίες που ολοκλήρωσε το μέλος (φόρμα, «Το έγραψα στο τετράδιό μου» ή συμπληρωμένο PDF) και δεν έχει πατήσει
 * «Το διάβασα» κανένας θεραπευτής (υπεύθυνη 17/10). Χωρίς το περιεχόμενο — μόνο τίτλος/βήμα/πότε.
 */
export async function fetchStepsToRead(memberIds: string[]): Promise<{ memberId: string; id: string; title: string; step: number | null; answeredAt: Date }[]> {
  if (memberIds.length === 0) return [];
  const [rows, done] = await Promise.all([
    prisma.assignment.findMany({ where: { memberId: { in: memberIds }, answeredAt: { not: null } }, select: { id: true, memberId: true, title: true, step: true, answeredAt: true }, orderBy: { answeredAt: "asc" } }),
    prisma.actionItem.findMany({ where: { memberId: { in: memberIds }, kind: "step_read", doneAt: { not: null } }, select: { ref: true } }),
  ]);
  const read = new Set(done.map((d) => d.ref));
  return rows.filter((r) => !read.has(`assignment:${r.id}`)).map((r) => ({ memberId: r.memberId, id: r.id, title: r.title, step: r.step, answeredAt: r.answeredAt as Date }));
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
  const KIND: Record<string, string> = { signal_followup: "Παρακολούθηση ανοιχτών σημάτων (παλιά ενέργεια)", safety_assessment: "Αξιολόγηση αναγκών ασφάλειας", initial_assessment: "Αρχική αξιολόγηση", cycle_review: "Ανασκόπηση κύκλου", step_read: "Βήμα/εργασία: το διάβασε θεραπευτής" };
  return [
    ...items.filter((r) => r.doneAt).map((r) => ({ title: KIND[r.kind] ?? r.kind, by: r.doneByName, at: r.doneAt as Date })),
    ...care.filter((c) => c.doneAt).map((c) => ({ title: c.kind === "new_cycle" ? "Νέος κύκλος: συμφωνητικό και προεξόφληση (διαχείριση)" : ADMIN_CARE.has(c.kind) ? "Τηλεφωνική επικοινωνία από τη διαχείριση" : "Μήνυμα φροντίδας", by: c.doneById ? (names.get(c.doneById) ?? null) : null, at: c.doneAt as Date })),
    ...help.filter((h) => h.talkedAt).map((h) => ({ title: "Κόκκινο κουμπί: μίλησαν", by: h.claimedByName, at: h.talkedAt as Date })),
    ...risk.map((r) => ({ title: "Αξιολόγηση αναγκών ασφάλειας", by: names.get(r.authorId) ?? null, at: r.createdAt })),
    ...reviews.map((r) => ({ title: "Κλείσιμο κύκλου (αρχειοθέτηση)", by: r.authorId === AUTO_AUTHOR ? "αυτόματα" : (names.get(r.authorId) ?? null), at: r.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

type Flags = { level: string; key?: string; text: string; at?: Date | null; trigText?: string }[];

/**
 * Οι ανοιχτές ενέργειες ενός μέλους (φάκελος, σελίδα ατομικής): από τα σήματα που ήδη υπολογίζονται, τα μηνύματα φροντίδας,
 * το κόκκινο κουμπί, την ανασκόπηση κύκλου και την αρχική αξιολόγηση, μαζί με την ανάληψη και την ολοκλήρωση.
 */
export async function loadMemberActions(memberId: string, memberName: string, flags: Flags, opts: { now?: Date; admin?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const [itemRows, care, help, member, assessed, finished, steps] = await Promise.all([
    fetchItemRows([memberId], now),
    // Ενέργειες της διαχείρισης (τηλεφωνήματα, νέος κύκλος): μόνο στη διαχείριση (υπεύθυνη 17/10).
    fetchCare([memberId], { includeAdminKinds: Boolean(opts.admin) }),
    fetchOpenHelp([memberId]),
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { createdAt: true, programStartDate: true } }),
    prisma.intakeCheck.findFirst({ where: { memberId, key: "assessment" }, select: { doneAt: true } }),
    lastFinishedCycle(memberId, now),
    fetchStepsToRead([memberId]),
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
    riskTrigger: rr?.at ? { at: rr.at, text: rr.trigText ?? "νέα αφορμή", dueAt: (rr as { dueAt?: Date }).dueAt ?? null } : null,
    initialAssessmentMissing: assessed ? null : { detail: "δεν έχει γίνει ακόμα", since: member.programStartDate ? new Date(`${member.programStartDate}T00:00:00Z`) : member.createdAt },
    cycleReviewDue: finished && !reviewDone ? { cycleId: finished.id, lastTherapist, since } : null,
    care: care.filter((c) => c.dueAt <= now),
    help,
    items: itemRows,
    stepsToRead: steps,
  });
}
