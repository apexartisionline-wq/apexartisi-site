import "server-only";
import { prisma } from "./db";
import { dec } from "./crypto";
import { hasPlanContent, missingSections, type PlanData } from "./safety-plan";
import { type ProtocolStepKey, protocolStep, sessionLabel, sessionOrdinal } from "./session-order";

export type SessionOrder = { n: number; step: ProtocolStepKey | null; label: string; assessed: boolean; planWritten: boolean };

/**
 * Αριθμός και βήμα πρωτοκόλλου για πολλές ατομικές μαζί (π.χ. το πρόγραμμα της ημέρας και της εβδομάδας):
 * τρεις ερωτήσεις συνολικά, όχι ανά μέλος. Τα Therapair δεν παίρνουν αρίθμηση (δεν περνιούνται).
 * Κανόνας: session-order.ts.
 */
export async function sessionOrders(slots: { id: string; startsAt: Date; memberId: string }[]): Promise<Map<string, SessionOrder>> {
  const out = new Map<string, SessionOrder>();
  if (slots.length === 0) return out;
  const memberIds = [...new Set(slots.map((s) => s.memberId))];
  const latest = new Date(Math.max(...slots.map((s) => s.startsAt.getTime())));
  const [prior, checks, plans, notes] = await Promise.all([
    prisma.booking.findMany({
      where: { memberId: { in: memberIds }, slot: { kind: "INDIVIDUAL", startsAt: { lt: latest } } },
      select: { memberId: true, confirmedCame: true, joinedAt: true, slot: { select: { id: true, startsAt: true } } },
    }),
    prisma.intakeCheck.findMany({ where: { memberId: { in: memberIds }, key: "assessment" }, select: { memberId: true } }),
    prisma.safetyPlan.findMany({ where: { memberId: { in: memberIds } }, select: { memberId: true, data: true } }),
    // Ατομική που έχει ήδη σημείωμα: το βήμα της είναι ό,τι έγινε ΤΟΤΕ (από το σημείωμα), όχι ό,τι εκκρεμεί σήμερα.
    prisma.sessionNote.findMany({ where: { slotId: { in: slots.map((s) => s.id) } }, select: { slotId: true, content: true } }),
  ]);
  const doneStep = new Map<string, ProtocolStepKey | null>();
  for (const n of notes) {
    let text = "";
    try { text = dec(n.content); } catch { text = ""; }
    doneStep.set(n.slotId, text.startsWith("Αρχική αξιολόγηση (1η ατομική)") ? "history" : text.startsWith("Πλάνο υποστήριξης (2η ατομική)") ? "plan" : null);
  }
  const assessed = new Set(checks.map((c) => c.memberId));
  const planWritten = new Set<string>();
  for (const p of plans) {
    const d = p.data as { enc?: string } & PlanData;
    let plan: PlanData | null = null;
    try { plan = d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : d; } catch { plan = null; }
    // «Γραμμένο» = και οι 7 ερωτήσεις απαντημένες· μισό πλάνο (π.χ. ενδιάμεση «Αποθήκευση») μένει βήμα για την επόμενη ατομική.
    if (hasPlanContent(plan) && missingSections(plan).length === 0) planWritten.add(p.memberId);
  }
  for (const s of slots) {
    const before = prior.filter((b) => b.memberId === s.memberId && b.slot.id !== s.id && b.slot.startsAt < s.startsAt);
    const n = sessionOrdinal(before);
    const a = assessed.has(s.memberId);
    const pw = planWritten.has(s.memberId);
    const step = doneStep.has(s.id) ? doneStep.get(s.id)! : protocolStep({ assessed: a, planWritten: pw });
    out.set(s.id, { n, step, label: sessionLabel(n, step), assessed: a, planWritten: pw });
  }
  return out;
}

/** Μία ατομική (σελίδα ατομικής, προετοιμασία). */
export async function sessionOrderOf(slot: { id: string; startsAt: Date; memberId: string }): Promise<SessionOrder> {
  return (await sessionOrders([slot])).get(slot.id)!;
}
