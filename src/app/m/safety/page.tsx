import { redirect } from "next/navigation";
import { SafetyPlanForm } from "@/components/SafetyPlanForm";
import { requireRole } from "@/lib/auth";
import { getPlan, savePlan } from "@/lib/safety";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  await savePlan(user.id, formData, user.id);
  redirect("/m/safety?ok=1");
}

export default async function MySafetyPlan({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireRole("MEMBER");
  const [plan, sp] = await Promise.all([getPlan(user.id), searchParams]);
  return (
    <main>
      <h1>Το πλάνο ασφάλειάς μου</h1>
      <p className="muted">Το φτιάξαμε μαζί στην αρχή. Θα το βλέπεις πρώτο όταν πατάς το κόκκινο κουμπί. Μπορείς να το αλλάζεις.</p>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      <SafetyPlanForm plan={plan} action={save} />
    </main>
  );
}
