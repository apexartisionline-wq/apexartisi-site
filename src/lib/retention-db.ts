import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { notifyRole } from "./notify";
import { collaborationEnd, cutoff, daysLeft, expiresAt, memberDue, noticesDue, RISK_ACCESS_ACTIONS, type RetentionKey } from "./retention";

/**
 * Αυτόματη εκκαθάριση κατά τους χρόνους τήρησης (src/lib/retention.ts · έγγραφο 13 του φακέλου συμμόρφωσης).
 *
 *  - Κάθε κατηγορία μετριέται· σε «προεπισκόπηση» δεν σβήνεται τίποτα. Σε εκτέλεση η διαγραφή είναι οριστική
 *    (και των προηγούμενων εκδόσεων / του ιστορικού) και καταγράφεται στο πρωτόκολλο (PurgeLog: κατηγορία, πλήθος,
 *    ώρα, εκτελέσας — χωρίς προσωπικά δεδομένα).
 *  - Μέλος σε αναστολή διαγραφής (RetentionHold, άρθρο 3.2) δεν αγγίζεται σε καμία κατηγορία.
 *  - Λήξη συνεργασίας = «Ολοκλήρωση συνεργασίας»· χωρίς αυτήν τίποτα δεν λήγει (το μέλος φαίνεται στη σελίδα
 *    «Τήρηση δεδομένων» ως ανενεργό χωρίς ολοκλήρωση).
 *  - Τα αντίγραφα ασφαλείας του παρόχου της βάσης λήγουν μέσα στο δικό τους κυκλικό παράθυρο (≤ 3 μήνες).
 *
 * Δεν καλύπτονται (ανοιχτό για τον Υπεύθυνο Προστασίας Δεδομένων): σημειώματα ομάδας (αφορούν πολλά μέλη),
 * μηνύματα μεταξύ θεραπευτών, λογαριασμοί προσωπικού — και οι συναινέσεις/υπογραφές του εντύπου εχεμύθειας
 * (StaffDocument, StaffConsent, 14/10): δεδομένα προσωπικού, όχι μέλους· δεν σβήνονται, ώσπου να αποφασίσει ο DPO
 * (ερώτημα 12 στον κ. Φωτσινό).
 */

export type PurgeLine = { category: RetentionKey; item: string; count: number };
export type PurgeResult = { runId: string; dryRun: boolean; lines: PurgeLine[]; held: number; noClosure: { id: string; name: string }[] };

type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

/** Μέλη σε ενεργή αναστολή διαγραφής. */
export async function heldMemberIds(): Promise<Set<string>> {
  return new Set((await prisma.retentionHold.findMany({ where: { liftedAt: null }, select: { memberId: true } })).map((h) => h.memberId));
}

/** Λήξη συνεργασίας ανά μέλος (μόνο όσα έχουν ολοκλήρωση). */
export async function collaborationEnds(): Promise<Map<string, Date>> {
  const closures = await prisma.closure.findMany({ select: { memberId: true, createdAt: true } });
  // Μόνο υπαρκτά μέλη (μια ολοκλήρωση χωρίς λογαριασμό δεν οδηγεί σε ενέργεια πάνω σε άλλον).
  const existing = new Set((await prisma.user.findMany({ where: { id: { in: [...new Set(closures.map((c) => c.memberId))] }, role: "MEMBER" }, select: { id: true } })).map((u) => u.id));
  const ids = [...existing];
  const cycles = await prisma.cycle.findMany({ where: { memberId: { in: ids } }, select: { memberId: true, startedAt: true } });
  const out = new Map<string, Date>();
  for (const id of ids) {
    const end = collaborationEnd(closures.filter((c) => c.memberId === id), cycles.filter((c) => c.memberId === id));
    if (end) out.set(id, end);
  }
  return out;
}

/** Ο κλινικός φάκελος ενός μέλους: μετράει ή σβήνει. Η ολοκλήρωση μένει μόνο ως ημερομηνία και τρόπος. */
async function clinicalOf(db: Tx, memberId: string, run: boolean): Promise<[string, number][]> {
  const notes = await db.sessionNote.findMany({ where: { slot: { bookings: { some: { memberId } } } }, select: { id: true } });
  const noteIds = notes.map((n) => n.id);
  const where = { memberId };
  const assignments = await db.assignment.findMany({ where, select: { id: true } });
  const items: [string, () => Promise<number>, () => Promise<{ count: number }>][] = [
    ["εκδόσεις σημειωμάτων ατομικής", () => db.sessionNoteVersion.count({ where: { noteId: { in: noteIds } } }), () => db.sessionNoteVersion.deleteMany({ where: { noteId: { in: noteIds } } })],
    ["σημειώματα ατομικής", async () => noteIds.length, () => db.sessionNote.deleteMany({ where: { id: { in: noteIds } } })],
    ["σημειώματα Therapair", () => db.pairNote.count({ where }), () => db.pairNote.deleteMany({ where })],
    ["ημερολόγιο ανάκαμψης (απογραφές)", () => db.journalEntry.count({ where }), () => db.journalEntry.deleteMany({ where })],
    ["στόχοι εβδομάδας", () => db.weeklyGoal.count({ where }), () => db.weeklyGoal.deleteMany({ where })],
    ["φωτογραφίες εργασιών", () => db.assignmentPhoto.count({ where: { assignmentId: { in: assignments.map((a) => a.id) } } }), () => db.assignmentPhoto.deleteMany({ where: { assignmentId: { in: assignments.map((a) => a.id) } } })],
    ["βήματα και εργασίες", () => db.assignment.count({ where }), () => db.assignment.deleteMany({ where })],
    ["απαντήσεις στις φόρμες της θεματικής", () => db.formAnswer.count({ where }), () => db.formAnswer.deleteMany({ where })],
    ["δηλώσεις βήματος", () => db.memberStep.count({ where }), () => db.memberStep.deleteMany({ where })],
    ["πλάνο υποστήριξης", () => db.safetyPlan.count({ where }), () => db.safetyPlan.deleteMany({ where })],
    ["αρχική αξιολόγηση", () => db.assessment.count({ where }), () => db.assessment.deleteMany({ where })],
    ["στοιχεία ταυτότητας και επαφής έκτακτης ανάγκης", () => db.memberProfile.count({ where }), () => db.memberProfile.deleteMany({ where })],
    ["ανάγκες ασφάλειας", () => db.riskReview.count({ where }), () => db.riskReview.deleteMany({ where })],
    ["σύνοψη περίπτωσης", () => db.caseSummary.count({ where }), () => db.caseSummary.deleteMany({ where })],
    ["ανασκοπήσεις κύκλου", () => db.cycleReview.count({ where }), () => db.cycleReview.deleteMany({ where })],
    ["μηνύματα μήνα", () => db.monthlyMessage.count({ where }), () => db.monthlyMessage.deleteMany({ where })],
    ["μηνύματα από την ομάδα", () => db.teamMessage.count({ where }), () => db.teamMessage.deleteMany({ where })],
    ["αλλαγές νηφαλιότητας", () => db.sobrietyChange.count({ where }), () => db.sobrietyChange.deleteMany({ where })],
    ["παρουσίες σε ομάδες", () => db.attendance.count({ where }), () => db.attendance.deleteMany({ where })],
    ["«Προσοχή σε…» από σημειώματα ομάδας", () => db.groupMention.count({ where }), () => db.groupMention.deleteMany({ where })],
    ["ενέργειες (ανάληψη)", () => db.actionItem.count({ where }), () => db.actionItem.deleteMany({ where })],
    ["μηνύματα φροντίδας και τηλεφωνήματα (εκτός ανάγκες ασφάλειας)", () => db.careTask.count({ where: { memberId, kind: { notIn: RISK_CARE } } }), () => db.careTask.deleteMany({ where: { memberId, kind: { notIn: RISK_CARE } } })],
    ["ιστορικό αλλαγών", () => db.recordHistory.count({ where: { memberId, kind: { notIn: ["booking_cancelled", "booking_moved"] } } }), () => db.recordHistory.deleteMany({ where: { memberId, kind: { notIn: ["booking_cancelled", "booking_moved"] } } })],
    ["ανοίγματα κόκκινου κουμπιού (χωρίς αίτημα)", () => db.helpOpen.count({ where }), () => db.helpOpen.deleteMany({ where })],
  ];
  const out: [string, number][] = [];
  for (const [label, count, del] of items) {
    const n = run ? (await del()).count : await count();
    if (n) out.push([label, n]);
  }
  // Λογαριασμός: ηχογραφημένο μήνυμα, νηφαλιότητα, συνδέσεις και ειδοποιήσεις κινητού· ο λογαριασμός απενεργοποιείται.
  const u = await db.user.findUnique({ where: { id: memberId }, select: { selfMessage: true, soberSince: true } });
  const sessions = run ? (await db.session.deleteMany({ where: { userId: memberId } })).count : await db.session.count({ where: { userId: memberId } });
  const subs = run ? (await db.pushSubscription.deleteMany({ where: { userId: memberId } })).count : await db.pushSubscription.count({ where: { userId: memberId } });
  if (u?.selfMessage) out.push(["ηχογραφημένο μήνυμα", 1]);
  if (u?.soberSince) out.push(["ημερομηνία νηφαλιότητας", 1]);
  if (sessions + subs) out.push(["συνδέσεις και ειδοποιήσεις κινητού", sessions + subs]);
  // Μόνο όσες ολοκληρώσεις έχουν ακόμα κείμενο (ώστε μια δεύτερη εκτέλεση να μη μετρά ξανά τα ίδια).
  const withText = (await db.closure.findMany({ where, select: { id: true, data: true, message: true } })).filter((c) => {
    const d = (() => { try { return JSON.parse(dec(c.data) || "{}") as { keeps?: string; referral?: string }; } catch { return {}; } })();
    return Boolean(dec(c.message) || d.keeps || d.referral);
  });
  if (withText.length) out.push(["κείμενο ολοκλήρωσης (μένει ημερομηνία και τρόπος)", withText.length]);
  if (run) {
    await db.user.updateMany({ where: { id: memberId }, data: { selfMessage: null, selfMessageType: null, soberSince: null, active: false } });
    if (withText.length) await db.closure.updateMany({ where: { id: { in: withText.map((c) => c.id) } }, data: { data: enc(JSON.stringify({ keeps: "", referral: "" })), message: enc("") } });
  }
  return out;
}

/** Μητρώο (5 έτη από τη λήξη): κρατήσεις, κύκλοι, συγκαταθέσεις· ο λογαριασμός ανωνυμοποιείται. */
async function registryOf(db: Tx, memberId: string, run: boolean): Promise<[string, number][]> {
  const where = { memberId };
  const items: [string, () => Promise<number>, () => Promise<{ count: number }>][] = [
    ["αιτήματα αλλαγής", () => db.changeRequest.count({ where }), () => db.changeRequest.deleteMany({ where })],
    ["κρατήσεις", () => db.booking.count({ where }), () => db.booking.deleteMany({ where })],
    ["κύκλοι", () => db.cycle.count({ where }), () => db.cycle.deleteMany({ where })],
    ["συγκαταθέσεις", () => db.consent.count({ where }), () => db.consent.deleteMany({ where })],
    ["βήματα έναρξης", () => db.intakeCheck.count({ where }), () => db.intakeCheck.deleteMany({ where })],
    ["ολοκληρώσεις συνεργασίας", () => db.closure.count({ where }), () => db.closure.deleteMany({ where })],
    ["ιστορικό ακυρώσεων", () => db.recordHistory.count({ where }), () => db.recordHistory.deleteMany({ where })],
    ["εκκρεμείς ειδοποιήσεις", () => db.queuedPush.count({ where: { userId: memberId } }), () => db.queuedPush.deleteMany({ where: { userId: memberId } })],
  ];
  const out: [string, number][] = [];
  for (const [label, count, del] of items) {
    const n = run ? (await del()).count : await count();
    if (n) out.push([label, n]);
  }
  out.push(["λογαριασμός μέλους (ανωνυμοποίηση)", 1]);
  if (run) {
    // Ανωνυμοποίηση: αφαιρείται κάθε άμεσο και έμμεσο αναγνωριστικό (έγγραφο 13, άρθρο 4).
    await db.user.updateMany({
      where: { id: memberId, role: "MEMBER" },
      data: {
        name: "Μέλος (ανωνυμοποιημένο)", username: `anon-${randomUUID()}`, passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        phone: null, email: null, mustChangeCode: false, memberCode: null, source: null, programStartDate: null, soberSince: null, selfMessage: null, selfMessageType: null,
        telegramUserId: null, totpSecret: null, totpEnabled: false, notifyPrefs: {}, toursSeen: [], active: false,
      },
    });
  }
  return out;
}

const RISK_CARE = ["risk_24h", "risk_next_day", "risk_contact"];

/**
 * Μία εκτέλεση της εκκαθάρισης. dryRun: μόνο μετράει (για τη σελίδα «Τήρηση δεδομένων»).
 * byId: ποιος την πάτησε (null = αυτόματη).
 */
export async function runRetention(o: { now?: Date; dryRun: boolean; byId?: string | null }): Promise<PurgeResult> {
  const now = o.now ?? new Date();
  const run = !o.dryRun;
  const runId = randomUUID();
  const lines: PurgeLine[] = [];
  const add = (category: RetentionKey, item: string, count: number) => {
    if (!count) return;
    const l = lines.find((x) => x.category === category && x.item === item);
    if (l) l.count += count;
    else lines.push({ category, item, count });
  };
  const held = await heldMemberIds();
  const notHeld = held.size ? { notIn: [...held] } : undefined;

  // 1–2. Ανά μέλος: κλινικός φάκελος (12 μήνες) και μητρώο (5 έτη) από τη λήξη συνεργασίας.
  const ends = await collaborationEnds();
  for (const [memberId, end] of ends) {
    const due = memberDue(end, now, held.has(memberId));
    if (!due.clinical) continue;
    const anonymized = await prisma.user.findUnique({ where: { id: memberId }, select: { username: true } });
    if (anonymized?.username.startsWith("anon-")) continue; // έχει ήδη ολοκληρωθεί
    const work = async (db: Tx) => {
      for (const [item, n] of await clinicalOf(db, memberId, run)) add("clinical", item, n);
      if (due.registry) for (const [item, n] of await registryOf(db, memberId, run)) add("registry", item, n);
    };
    if (run) await prisma.$transaction(async (tx) => work(tx), { timeout: 60_000 });
    else await work(prisma);
  }

  // 3. Τεκμηρίωση κινδύνου: 5 έτη από το περιστατικό.
  const riskCut = cutoff("risk", now);
  const m = notHeld ? { memberId: notHeld } : {};
  const riskItems: [string, () => Promise<number>, () => Promise<{ count: number }>][] = [
    ["κόκκινο κουμπί", () => prisma.helpRequest.count({ where: { ...m, createdAt: { lt: riskCut } } }), () => prisma.helpRequest.deleteMany({ where: { ...m, createdAt: { lt: riskCut } } })],
    ["γραμμές ενημέρωσης ομάδας", () => prisma.teamAlert.count({ where: { ...m, createdAt: { lt: riskCut } } }), () => prisma.teamAlert.deleteMany({ where: { ...m, createdAt: { lt: riskCut } } })],
    ["συμβάντα", () => prisma.incident.count({ where: { ...m, OR: [{ closedAt: { lt: riskCut } }, { closedAt: null, createdAt: { lt: riskCut } }] } }), () => prisma.incident.deleteMany({ where: { ...m, OR: [{ closedAt: { lt: riskCut } }, { closedAt: null, createdAt: { lt: riskCut } }] } })],
    ["τηλεφωνήματα για ανάγκες ασφάλειας", () => prisma.careTask.count({ where: { ...m, kind: { in: RISK_CARE }, createdAt: { lt: riskCut } } }), () => prisma.careTask.deleteMany({ where: { ...m, kind: { in: RISK_CARE }, createdAt: { lt: riskCut } } })],
    ["άνοιγμα «Έκτακτης ανάγκης»", () => prisma.accessLog.count({ where: { ...m, action: { in: RISK_ACCESS_ACTIONS }, at: { lt: riskCut } } }), () => prisma.accessLog.deleteMany({ where: { ...m, action: { in: RISK_ACCESS_ACTIONS }, at: { lt: riskCut } } })],
  ];
  for (const [item, count, del] of riskItems) add("risk", item, run ? (await del()).count : await count());

  // 4. Ραντεβού που δεν πραγματοποιήθηκαν: 6 μήνες από την ημερομηνία του ραντεβού.
  const unheldCut = cutoff("unheld", now);
  const cancelled = await prisma.recordHistory.findMany({ where: { ...m, kind: { in: ["booking_cancelled", "booking_moved"] } }, select: { id: true, before: true, createdAt: true } });
  const oldCancelled = cancelled.filter((r) => {
    let at = r.createdAt;
    try { const b = JSON.parse(dec(r.before)) as { startsAt?: string }; if (b.startsAt) at = new Date(b.startsAt); } catch {}
    return at < unheldCut;
  }).map((r) => r.id);
  add("unheld", "ακυρώσεις και μεταφορές στο ιστορικό", run ? (await prisma.recordHistory.deleteMany({ where: { id: { in: oldCancelled } } })).count : oldCancelled.length);
  const crWhere = { ...m, status: { not: "PENDING" as const }, sessionAt: { lt: unheldCut } };
  add("unheld", "αιτήματα αλλαγής/ακύρωσης που έκλεισαν", run ? (await prisma.changeRequest.deleteMany({ where: crWhere })).count : await prisma.changeRequest.count({ where: crWhere }));

  // 5. Αρχεία καταγραφής: 6 μήνες από τη δημιουργία.
  const logCut = cutoff("logs", now);
  const accessWhere = { action: { notIn: RISK_ACCESS_ACTIONS }, at: { lt: logCut }, ...(notHeld ? { OR: [{ memberId: null }, { memberId: notHeld }] } : {}) };
  add("logs", "καταγραφή πρόσβασης", run ? (await prisma.accessLog.deleteMany({ where: accessWhere })).count : await prisma.accessLog.count({ where: accessWhere }));
  add("logs", "πάτημα «Μπες» θεραπευτή", run ? (await prisma.staffJoin.deleteMany({ where: { at: { lt: logCut } } })).count : await prisma.staffJoin.count({ where: { at: { lt: logCut } } }));
  add("logs", "ειδοποιήσεις (αρχείο αποστολής)", run ? (await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: logCut } } })).count : await prisma.notificationLog.count({ where: { sentAt: { lt: logCut } } }));
  add("logs", "ειδοποιήσεις κινητού που στάλθηκαν", run ? (await prisma.queuedPush.deleteMany({ where: { sentAt: { lt: logCut } } })).count : await prisma.queuedPush.count({ where: { sentAt: { lt: logCut } } }));

  // Μέλη ανενεργά χωρίς «Ολοκλήρωση συνεργασίας»: δεν λήγει τίποτα μέχρι να καταγραφεί η λήξη.
  const noClosure = await prisma.user.findMany({
    where: { role: "MEMBER", active: false, username: { not: { startsWith: "anon-" } }, id: { notIn: [...ends.keys()] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (run) {
    // Πρωτόκολλο: μία γραμμή ανά είδος (και μία για την ίδια την εκτέλεση, ακόμη κι αν δεν σβήστηκε τίποτα).
    await prisma.purgeLog.createMany({
      data: [{ runId, category: "run", item: "εκτέλεση εκκαθάρισης", count: lines.reduce((a, l) => a + l.count, 0), byId: o.byId ?? null, at: now },
        ...lines.map((l) => ({ runId, category: l.category, item: l.item, count: l.count, byId: o.byId ?? null, at: now }))],
    });
  }
  return { runId, dryRun: !run, lines, held: held.size, noClosure };
}

/** Μία αυτόματη εκτέλεση την ημέρα (από το /api/cron/tick, με εφεδρεία το «Σήμερα» της διαχείρισης). */
export async function runRetentionDaily(now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 20 * 3600_000);
  if (await prisma.purgeLog.findFirst({ where: { category: "run", at: { gte: since } }, select: { id: true } })) return false;
  const r = await runRetention({ now, dryRun: false, byId: null });
  await notifyRetention(now, r.lines).catch((e) => console.error("[retention-notice]", e));
  return true;
}

/** Φάκελοι μελών που λήγουν μέσα σε 30 μέρες (για το «Σήμερα» της διαχείρισης και τις ειδοποιήσεις). */
export async function expiringSoon(now = new Date()) {
  const up = await upcomingExpiries(now);
  return up.flatMap((u) => (u.held ? [] : ([["clinical", u.clinicalAt], ["registry", u.registryAt]] as const)
    .filter(([, at]) => noticesDue(at, now).length > 0)
    .map(([kind, at]) => ({ memberId: u.id, name: u.name, kind, at, left: daysLeft(at, now) }))));
}

/**
 * Ειδοποιήσεις τήρησης προς τη διαχείριση (16/10): μία φορά ανά φάκελο και όριο (30 και 7 μέρες πριν, κλειδί στο
 * NotificationLog), ώστε να προλάβει «Αναστολή διαγραφής» αν χρειάζεται· και μετά από εκκαθάριση που έσβησε φακέλους
 * μελών (κλινικός, μητρώο, τεκμηρίωση κινδύνου). Τα αρχεία καταγραφής και τα ακυρωμένα ραντεβού λήγουν κυλιόμενα κάθε
 * μέρα — αυτά μένουν μόνο στο πρωτόκολλο της σελίδας, χωρίς μήνυμα. Η ειδοποίηση δεν έχει ονόματα (φαίνεται στο κινητό)·
 * τα ονόματα είναι μέσα στη σελίδα «Τήρηση δεδομένων».
 */
export async function notifyRetention(now = new Date(), deleted: PurgeLine[] = []): Promise<{ notices: number; deleted: number }> {
  let fresh = 0, soon7 = false;
  for (const e of await expiringSoon(now)) {
    for (const d of noticesDue(e.at, now)) {
      try {
        await prisma.notificationLog.create({ data: { key: `retention_notice:${d}:${e.kind}:${e.memberId}:${e.at.toISOString().slice(0, 10)}` } });
        fresh++;
        if (d === 7) soon7 = true;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
  }
  if (fresh > 0) {
    await notifyRole("ADMIN", {
      title: "Τήρηση δεδομένων: προσεχής διαγραφή",
      body: `${soon7 ? "Φάκελος μέλους λήγει σε 7 μέρες ή λιγότερο" : "Φάκελος μέλους λήγει σε 30 μέρες ή λιγότερο"} και θα διαγραφεί αυτόματα. Αν χρειάζεται αναστολή διαγραφής, δες «Τήρηση δεδομένων».`,
      url: "/admin/retention", tag: "retention-notice",
    }).catch(() => undefined);
  }
  const removed = deleted.filter((l) => (l.category === "clinical" || l.category === "registry" || l.category === "risk") && l.count > 0).reduce((a, l) => a + l.count, 0);
  if (removed > 0) {
    await notifyRole("ADMIN", { title: "Τήρηση δεδομένων: έγινε διαγραφή", body: `Διαγράφηκαν ${removed} εγγραφές φακέλων μελών, όπως ορίζουν οι χρόνοι τήρησης. Το πρωτόκολλο είναι στη σελίδα «Τήρηση δεδομένων».`, url: "/admin/retention", tag: "retention-done" }).catch(() => undefined);
  }
  return { notices: fresh, deleted: removed };
}

/** Για τη σελίδα «Τήρηση δεδομένων»: πότε λήγει ο φάκελος κάθε μέλους με ολοκλήρωση. */
export async function upcomingExpiries(now = new Date()) {
  const [ends, held] = await Promise.all([collaborationEnds(), heldMemberIds()]);
  const users = await prisma.user.findMany({ where: { id: { in: [...ends.keys()] }, username: { not: { startsWith: "anon-" } } }, select: { id: true, name: true } });
  return users
    .map((u) => {
      const end = ends.get(u.id)!;
      return { id: u.id, name: u.name, end, clinicalAt: expiresAt("clinical", end), registryAt: expiresAt("registry", end), held: held.has(u.id), clinicalDone: expiresAt("clinical", end) <= now };
    })
    .sort((a, b) => a.clinicalAt.getTime() - b.clinicalAt.getTime());
}
