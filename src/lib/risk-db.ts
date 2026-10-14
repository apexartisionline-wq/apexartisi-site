import "server-only";
import { logAccess } from "./audit";
import { memberNotes } from "./member-notes";
import { notifyRole } from "./notify";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { assessmentDeadline, daysOverdue, type Level, LEVELS, needsReview, type RiskReview, riskSchema, type Trigger } from "./risk";
import { Prisma } from "@prisma/client";
import { localParts } from "./time";

export async function riskHistory(memberId: string, take = 10) {
  const rows = await prisma.riskReview.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const raw = JSON.parse(dec(r.data)) as RiskReview;
    return { id: r.id, level: r.level as Level, data: raw, at: r.createdAt, author: names.get(r.authorId) ?? "" };
  });
}

/** Μόνο ψυχολόγος (ή η διαχείριση) κάνει την αξιολόγηση αναγκών ασφάλειας. */
export function canWriteRisk(user: { role: string; therapistKind: string | null }): boolean {
  return user.role === "ADMIN" || user.therapistKind === "CLINICAL" || user.therapistKind === "BOTH";
}

/**
 * Αποθήκευση (νέα γραμμή, ποτέ αντικατάσταση). Αυξημένες/Υψηλές: μία γραμμή 24 ώρες στο «Σήμερα» όλων
 * (άρα και της Εύας), με το τι χρειάζεται (επαφή).
 */
export async function saveRisk(memberId: string, user: { id: string }, d: RiskReview) {
  const parsed = riskSchema.parse(d);
  const level = parsed.level as Level;
  const now = new Date();
  // Μία ανοιχτή ενέργεια επαφής ανά μέλος: αν η διαχείριση δεν πρόλαβε την προηγούμενη, δεν της προστίθεται δεύτερη.
  const openContact = level === "LOW" ? null : await prisma.careTask.findFirst({ where: { memberId, kind: "risk_contact", doneAt: null }, select: { id: true } });
  await prisma.$transaction([
    prisma.riskReview.create({ data: { memberId, level, data: enc(JSON.stringify(parsed)), authorId: user.id } }),
    // Το βήμα «risk» της έναρξης κρατά το τρέχον επίπεδο (το διαβάζουν φάκελος και σήματα).
    prisma.intakeCheck.upsert({
      where: { memberId_key: { memberId, key: "risk" } },
      create: { memberId, key: "risk", value: level, doneById: user.id, note: enc(parsed.rationale) },
      update: { value: level, doneById: user.id, doneAt: now, note: enc(parsed.rationale) },
    }),
    ...(level === "LOW"
      ? []
      : [
          prisma.teamAlert.create({ data: { memberId, source: "RISK", kind: level, byId: user.id } }),
          // Την επαφή (24 ώρες / επόμενη μέρα) την κάνει η διαχείριση: τηλέφωνο + «τι έγινε» στο «Σήμερα» της.
          ...(openContact ? [] : [prisma.careTask.create({ data: { memberId, kind: "risk_contact", dueAt: now } })]),
        ]),
  ]);
  await logAccess(user.id, memberId, `risk_review_${level}`);
  if (level !== "LOW") await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${memberId}` }).catch(() => undefined);
}

/** Αφορμές για νέα αξιολόγηση: υποτροπή, κόκκινο κουμπί, ανησυχία στο σημείωμα, σκέψεις ή χρήση στο ημερολόγιο. */
export async function riskTrigger(memberId: string): Promise<Trigger | null> {
  const [help, notes, last, journal, journalUsed] = await Promise.all([
    prisma.helpRequest.findFirst({ where: { memberId, isDrill: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    memberNotes(memberId, { take: 20 }).then((ns) => ns.filter((n) => n.usedSince === "YES" || n.riskChange === "UP").slice(0, 5)),
    prisma.riskReview.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    // Σκέψεις να κάνει κακό στον εαυτό του, γραμμένες στο ημερολόγιο (απόφαση 3/10).
    prisma.journalEntry.findFirst({ where: { memberId, selfHarm: { in: ["YES", "UNSURE"] } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    // «Έκανα χρήση» στο ημερολόγιο: αφορμή όπως η χρήση στο σημείωμα (απόφαση υπεύθυνης 14/10).
    prisma.journalEntry.findFirst({ where: { memberId, used: true }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const triggers: Trigger[] = [
    ...(help ? [{ at: help.createdAt, text: "κόκκινο κουμπί" }] : []),
    ...(journal ? [{ at: journal.updatedAt, text: "σκέψεις στο ημερολόγιο" }] : []),
    ...(journalUsed ? [{ at: journalUsed.updatedAt, text: "χρήση στο ημερολόγιο" }] : []),
    ...notes.map((n) => ({ at: n.createdAt, text: n.usedSince === "YES" ? "υποτροπή" : "ανησυχία στο σημείωμα" })),
  ];
  return needsReview(triggers, last?.createdAt ?? null);
}

/**
 * Το επίπεδο αναγκών ασφάλειας όπως φαίνεται παντού (φάκελος, ατομική, σελίδα αναγκών ασφάλειας):
 * μία πηγή, η τελευταία αξιολόγηση· αν υπάρχει νέα αφορμή, «Θέλει αξιολόγηση».
 */
export async function currentRisk(memberId: string) {
  const [[last], trigger] = await Promise.all([riskHistory(memberId, 1), riskTrigger(memberId)]);
  const label = trigger ? "Θέλει αξιολόγηση" : last ? LEVELS[last.level] : "Δεν έχει χρειαστεί";
  return { level: last?.level ?? null, at: last?.at ?? null, author: last?.author ?? "", trigger, label };
}

/**
 * Η επόμενη προγραμματισμένη ατομική του μέλους με ψυχολόγο (κλινικό ή «και τα δύο»), για να φαίνεται πού θα γίνει
 * μια αξιολόγηση που εκκρεμεί όταν η αμέσως επόμενη ατομική είναι με βιωματικό (εναλλαγή). Μόνο πληροφορία δρομολόγησης·
 * δεν ορίζει προθεσμία.
 */
export async function nextClinicalSession(memberId: string, now = new Date()) {
  const b = await prisma.booking.findFirst({
    where: { memberId, slot: { startsAt: { gt: now }, therapist: { therapistKind: { in: ["CLINICAL", "BOTH"] } } } },
    orderBy: { slot: { startsAt: "asc" } },
    select: { slot: { select: { id: true, date: true, startsAt: true, therapist: { select: { name: true } } } } },
  });
  return b ? { slotId: b.slot.id, date: b.slot.date, startsAt: b.slot.startsAt, therapist: b.slot.therapist?.name ?? "" } : null;
}

/** Η αμέσως επόμενη ατομική (όποιου τύπου), με τον τύπο του θεραπευτή — για τη δρομολόγηση στο «Σήμερα» της διαχείρισης. */
export async function nextSession(memberId: string, now = new Date()) {
  const b = await prisma.booking.findFirst({
    where: { memberId, slot: { startsAt: { gt: now } } },
    orderBy: { slot: { startsAt: "asc" } },
    select: { slot: { select: { id: true, date: true, startsAt: true, therapist: { select: { name: true, therapistKind: true } } } } },
  });
  return b ? { slotId: b.slot.id, date: b.slot.date, startsAt: b.slot.startsAt, therapist: b.slot.therapist?.name ?? "", kind: b.slot.therapist?.therapistKind ?? null } : null;
}

/** Η αφορμή μαζί με την προθεσμία της (απόφαση 14/10) και αν έχει περάσει. */
export async function riskTriggerDue(memberId: string, now = new Date()) {
  const trig = await riskTrigger(memberId);
  if (!trig) return null;
  const next = await nextClinicalSession(memberId, trig.at);
  const dueAt = assessmentDeadline(trig.at, next?.startsAt ?? null);
  return { ...trig, dueAt, overdue: dueAt <= now, daysOverdue: daysOverdue(dueAt, now), nextClinical: next };
}

/**
 * Κλιμάκωση (cron κάθε μισή ώρα): για κάθε ενεργό μέλος με εκπρόθεσμη αξιολόγηση, ένα μήνυμα στη διαχείριση την ημέρα.
 * Δεν αναθέτει, δεν κλείνει τίποτα — η διαχείριση συντονίζει.
 */
export async function remindOverdueAssessments(now = new Date()): Promise<number> {
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true } });
  let sent = 0;
  for (const m of members) {
    const due = await riskTriggerDue(m.id, now);
    if (!due?.overdue) continue;
    try {
      await prisma.notificationLog.create({ data: { key: `risk_overdue:${m.id}:${localParts(now).date}` } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
    await notifyRole("ADMIN", { title: "Εκπρόθεσμη αξιολόγηση αναγκών ασφάλειας", body: `${m.name} · ${due.daysOverdue === 0 ? "σήμερα" : `${due.daysOverdue} ${due.daysOverdue === 1 ? "μέρα" : "μέρες"}`} μετά την προθεσμία — δες το «Σήμερα»`, url: "/admin", tag: `risk-overdue-${m.id}` }).catch(() => undefined);
    sent++;
  }
  return sent;
}
