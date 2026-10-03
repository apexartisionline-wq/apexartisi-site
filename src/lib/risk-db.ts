import "server-only";
import { logAccess } from "./audit";
import { memberNotes } from "./member-notes";
import { notifyRole } from "./notify";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { type Level, LEVELS, needsReview, type RiskReview, riskSchema, type Trigger } from "./risk";

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
        ]),
  ]);
  await logAccess(user.id, memberId, `risk_review_${level}`);
  if (level !== "LOW") await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${memberId}` }).catch(() => undefined);
}

/** Αφορμές για νέα αξιολόγηση: υποτροπή, κόκκινο κουμπί, ανησυχία στο σημείωμα. */
export async function riskTrigger(memberId: string): Promise<Trigger | null> {
  const [help, notes, last] = await Promise.all([
    prisma.helpRequest.findFirst({ where: { memberId, isDrill: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    memberNotes(memberId, { take: 20 }).then((ns) => ns.filter((n) => n.usedSince === "YES" || n.riskChange === "UP").slice(0, 5)),
    prisma.riskReview.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const triggers: Trigger[] = [
    ...(help ? [{ at: help.createdAt, text: "κόκκινο κουμπί" }] : []),
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
  const label = trigger ? "Θέλει αξιολόγηση" : last ? LEVELS[last.level] : "Δεν χρειάστηκε αξιολόγηση";
  return { level: last?.level ?? null, at: last?.at ?? null, author: last?.author ?? "", trigger, label };
}
