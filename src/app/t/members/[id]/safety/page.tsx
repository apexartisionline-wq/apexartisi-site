import { notFound, redirect } from "next/navigation";
import { SafetyPlanForm } from "@/components/SafetyPlanForm";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlan, planForStaff, savePlan } from "@/lib/safety";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("memberId"));
  await savePlan(id, formData, user.id, user.role !== "ADMIN");
  await logAccess(user.id, id, "safety_plan_edit");
  redirect(`/t/members/${id}/safety?ok=1`);
}

export default async function MemberSafetyPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "safety_plan_view");
  const raw = await getPlan(id);
  // Οι θεραπευτές δεν βλέπουν τηλέφωνα· η διαχείριση βλέπει όλο το πλάνο.
  const plan = user.role === "ADMIN" ? raw : planForStaff(raw);
  return (
    <main>
      <h1>Πλάνο ασφάλειας — {member.name}</h1>
      <p className="muted small">Γράφεται μαζί, μέσα στην ατομική, με τα λόγια του μέλους. Το μέλος το βλέπει μέσα στο κόκκινο κουμπί.</p>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      <SafetyPlanForm plan={plan} action={save} hidden={{ memberId: id }} staff={user.role !== "ADMIN"} />
    </main>
  );
}
