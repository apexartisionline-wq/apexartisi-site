import "server-only";
import { dec, enc } from "./crypto";
import { z } from "zod";
import { prisma } from "./db";
import { keepHistory } from "./history";
import { maskPhones } from "./risk";

// Πλάνο ασφάλειας (βλ. docs/clinical/04): γράφεται μαζί, μέσα στην ατομική, με τα λόγια του μέλους.
// Τα τηλέφωνα των ανθρώπων του πλάνου τα βλέπει μόνο το μέλος και η διαχείριση· οι θεραπευτές μόνο τα ονόματα.
export const PLAN_FIELDS = [
  { key: "warningSigns", label: "Σημάδια ότι δυσκολεύομαι", hint: "σκέψεις, συναισθήματα, μέρη, άνθρωποι, λαχτάρα" },
  { key: "myCoping", label: "Τι κάνω μόνος/η μου", hint: "π.χ. περπάτημα, ντους, αναπνοή, μουσική" },
  { key: "distractions", label: "Άνθρωποι και μέρη που με βοηθούν να ξεφύγω", hint: "" },
  { key: "safeEnvironment", label: "Πώς κάνω το περιβάλλον μου πιο ασφαλές", hint: "ουσίες, χρήματα/κάρτες για τζόγο, άλλα μέσα" },
  { key: "reasons", label: "Γιατί αξίζει να συνεχίσω", hint: "" },
] as const;
export const HELPERS_MAX = 4;

export type Helper = { name: string; phone: string };
export type PlanData = Partial<Record<(typeof PLAN_FIELDS)[number]["key"] | "helpers", string>> & { helperList?: Helper[] };

export async function getPlan(memberId: string): Promise<PlanData | null> {
  const row = await prisma.safetyPlan.findUnique({ where: { memberId } });
  if (!row) return null;
  const d = row.data as { enc?: string } & PlanData;
  return d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : d;
}

/** Το πλάνο όπως το βλέπει ο θεραπευτής: χωρίς τηλέφωνα. */
export function planForStaff(p: PlanData | null): PlanData | null {
  if (!p) return null;
  const out: PlanData = { helperList: (p.helperList ?? []).map((h) => ({ name: h.name, phone: h.phone ? "•••" : "" })) };
  for (const f of PLAN_FIELDS) if (p[f.key]) out[f.key] = maskPhones(p[f.key]!);
  if (p.helpers) out.helpers = maskPhones(p.helpers);
  return out;
}

/**
 * Αποθήκευση. Όταν γράφει θεραπευτής (staffView), δεν έχει δει τηλέφωνα: ό,τι έμεινε κρυμμένο
 * κρατιέται από την προηγούμενη μορφή (δεν σβήνεται κατά λάθος).
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
