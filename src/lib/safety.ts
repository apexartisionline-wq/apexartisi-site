import "server-only";
import { z } from "zod";
import { prisma } from "./db";

// Πλάνο ασφάλειας (βλ. docs/clinical/04): γράφεται μαζί με το μέλος στην έναρξη.
export const PLAN_FIELDS = [
  { key: "warningSigns", label: "Σημάδια ότι δυσκολεύομαι", hint: "σκέψεις, συναισθήματα, μέρη, άνθρωποι, λαχτάρα" },
  { key: "myCoping", label: "Τι κάνω μόνος/η μου", hint: "π.χ. περπάτημα, ντους, αναπνοή, μουσική" },
  { key: "distractions", label: "Άνθρωποι και μέρη που με βοηθούν να ξεφύγω", hint: "" },
  { key: "helpers", label: "Άνθρωποι που μπορώ να καλέσω (όνομα και τηλέφωνο)", hint: "" },
  { key: "safeEnvironment", label: "Πώς κάνω το περιβάλλον μου πιο ασφαλές", hint: "ουσίες, χρήματα/κάρτες για τζόγο, άλλα μέσα" },
  { key: "reasons", label: "Γιατί αξίζει να συνεχίσω", hint: "" },
] as const;

export type PlanData = Partial<Record<(typeof PLAN_FIELDS)[number]["key"], string>>;

export async function getPlan(memberId: string): Promise<PlanData | null> {
  const row = await prisma.safetyPlan.findUnique({ where: { memberId } });
  return (row?.data as PlanData) ?? null;
}

export async function savePlan(memberId: string, formData: FormData, byId: string): Promise<void> {
  const data: PlanData = {};
  for (const f of PLAN_FIELDS) data[f.key] = z.string().max(3000).parse(String(formData.get(f.key) ?? "")).trim();
  await prisma.safetyPlan.upsert({
    where: { memberId },
    create: { memberId, data, updatedById: byId },
    update: { data, updatedById: byId },
  });
}
