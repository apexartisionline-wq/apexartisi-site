import "server-only";
import { dec, enc } from "./crypto";
import { z } from "zod";
import { prisma } from "./db";
import { keepHistory } from "./history";
import { maskPhones } from "./risk";
import { HELPERS_MAX, PLAN_FIELDS, type PlanData } from "./safety-plan";

// «Το πλάνο μου όταν δυσκολεύομαι» (βλ. docs/clinical/04): γράφεται μαζί, μέσα στην ατομική, με τα λόγια του μέλους.
// Τα τηλέφωνα των ανθρώπων του πλάνου τα βλέπει μόνο το μέλος και η διαχείριση· οι θεραπευτές μόνο τα ονόματα.
// Οι ερωτήσεις, οι τύποι και η καθαρή λογική (ελλιπείς ενότητες, τελευταία ανασκόπηση) είναι στο safety-plan.ts.
export { HELPERS_LABEL, HELPERS_MAX, HELPERS_NEXT_LABEL, PLAN_FIELDS, PLAN_ORDER, hasPlanContent, lastDiscussed, lastReviewAt, missingSections, planHelpers } from "./safety-plan";
export type { Helper, PlanData, PlanDiscussed, PlanFieldKey } from "./safety-plan";

export async function getPlan(memberId: string): Promise<PlanData | null> {
  const row = await prisma.safetyPlan.findUnique({ where: { memberId } });
  if (!row) return null;
  const d = row.data as { enc?: string } & PlanData;
  return d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : d;
}

/** Το πλάνο μαζί με την ώρα της τελευταίας αλλαγής (για την «τελευταία ανασκόπηση»). */
export async function getPlanWithMeta(memberId: string): Promise<{ plan: PlanData; updatedAt: Date } | null> {
  const row = await prisma.safetyPlan.findUnique({ where: { memberId } });
  if (!row) return null;
  const d = row.data as { enc?: string } & PlanData;
  return { plan: d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : d, updatedAt: row.updatedAt };
}

/** Το πλάνο όπως το βλέπει ο θεραπευτής: χωρίς τηλέφωνα (τα «συζητήθηκε» μένουν, δεν είναι προσωπικά στοιχεία). */
export function planForStaff(p: PlanData | null): PlanData | null {
  if (!p) return null;
  const out: PlanData = { helperList: (p.helperList ?? []).map((h) => ({ name: h.name, phone: h.phone ? "•••" : "" })) };
  for (const f of PLAN_FIELDS) if (p[f.key]) out[f.key] = maskPhones(p[f.key]!);
  if (p.helpers) out.helpers = maskPhones(p.helpers);
  if (p.discussed) out.discussed = p.discussed;
  return out;
}

/**
 * Αποθήκευση. Όταν γράφει θεραπευτής (staffView), δεν έχει δει τηλέφωνα: ό,τι έμεινε κρυμμένο
 * κρατιέται από την προηγούμενη μορφή (δεν σβήνεται κατά λάθος). Τα «συζητήθηκε» κρατιούνται πάντα.
 */
export async function savePlan(memberId: string, formData: FormData, byId: string, staffView = false): Promise<void> {
  const prev = (await getPlan(memberId)) ?? {};
  const str = (k: string, max = 3000) => z.string().max(max).parse(String(formData.get(k) ?? "")).trim();
  const data: PlanData = {};
  for (const f of PLAN_FIELDS) {
    const v = str(f.key);
    data[f.key] = staffView && prev[f.key] && v === maskPhones(prev[f.key]!) ? prev[f.key] : v;
  }
  if (prev.helpers) data.helpers = staffView && str("helpers") === maskPhones(prev.helpers) ? prev.helpers : str("helpers");
  data.helperList = [];
  for (let i = 0; i < HELPERS_MAX; i++) {
    const name = str(`helperName${i}`, 120);
    let phone = str(`helperPhone${i}`, 30);
    // Ο θεραπευτής δεν γράφει τηλέφωνα: κρατιέται ό,τι υπήρχε (με το ίδιο όνομα, ή στην ίδια θέση).
    if (staffView) phone = prev.helperList?.find((h) => h.name === name)?.phone ?? (prev.helperList?.[i]?.name ? "" : prev.helperList?.[i]?.phone ?? "");
    if (name || phone) data.helperList.push({ name, phone });
  }
  // Το ιστορικό «συζητήθηκε με το μέλος» δεν αλλάζει από τη φόρμα: μόνο προσθήκη (markPlanDiscussed), ποτέ σβήσιμο.
  if (prev.discussed?.length) data.discussed = prev.discussed;
  const stored = { enc: enc(JSON.stringify(data)) };
  const old = await prisma.safetyPlan.findUnique({ where: { memberId } });
  await prisma.$transaction([
    // Η προηγούμενη μορφή κρατιέται (ποτέ σβήσιμο).
    ...(old ? [keepHistory("safety_plan", { memberId, before: { data: prev, by: old.updatedById, at: old.updatedAt }, byId })] : []),
    prisma.safetyPlan.upsert({
      where: { memberId },
      create: { memberId, data: stored, updatedById: byId },
      update: { data: stored, updatedById: byId },
    }),
  ]);
}

/**
 * «Το συζητήσαμε σήμερα με το μέλος»: μία γραμμή (ποιος, πότε) μέσα στο JSON του πλάνου, μόνο προσθήκη.
 * Το περιεχόμενο του πλάνου δεν αλλάζει, γι' αυτό δεν ανοίγει νέα «προηγούμενη μορφή» στο ιστορικό.
 * Αν δεν υπάρχει πλάνο, δεν γίνεται τίποτα (δεν φτιάχνουμε κενό πλάνο).
 */
export async function markPlanDiscussed(memberId: string, by: { id: string; name: string }): Promise<boolean> {
  const row = await prisma.safetyPlan.findUnique({ where: { memberId } });
  if (!row) return false;
  const d = row.data as { enc?: string } & PlanData;
  const plan: PlanData = d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : { ...d };
  plan.discussed = [...(plan.discussed ?? []), { at: new Date().toISOString(), byId: by.id, byName: by.name }];
  await prisma.safetyPlan.update({ where: { memberId }, data: { data: { enc: enc(JSON.stringify(plan)) } } });
  return true;
}
