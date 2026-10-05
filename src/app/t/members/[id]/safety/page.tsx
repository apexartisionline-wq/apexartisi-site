import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SafetyPlanForm } from "@/components/SafetyPlanForm";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { historyOf } from "@/lib/history";
import { getPlan, HELPERS_MAX, PLAN_FIELDS, type PlanData, planForStaff, savePlan } from "@/lib/safety";
import { formatWhen } from "@/lib/time";

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
  const admin = user.role === "ADMIN";
  const plan = admin ? raw : planForStaff(raw);
  const older = await historyOf("safety_plan", { memberId: id });
  const show = (p: PlanData) => (admin ? p : planForStaff(p)!);
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <h1>Πλάνο ασφάλειας — {member.name}</h1>
      <p className="muted small">Γράφεται μαζί, μέσα στην ατομική, με τα λόγια του μέλους. Το μέλος το βλέπει μέσα στο κόκκινο κουμπί.</p>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      <SafetyPlanForm plan={plan} action={save} hidden={{ memberId: id }} staff={!admin} />
      {older.length > 0 && (
        <details className="card small">
          <summary>Προηγούμενες μορφές ({older.length})</summary>
          {older.map((h, i) => {
            const p = show((h.before as { data: PlanData }).data ?? {});
            return (
              <div key={i} style={{ marginTop: 12 }}>
                <div className="muted">Πριν από την αλλαγή της {formatWhen(h.at)} · {h.by}</div>
                {PLAN_FIELDS.filter((f) => p[f.key]).map((f) => <div key={f.key}><strong>{f.label}:</strong> {p[f.key]}</div>)}
                {(p.helperList ?? []).slice(0, HELPERS_MAX).filter((x) => x.name).length > 0 && (
                  <div><strong>Άνθρωποι:</strong> {(p.helperList ?? []).map((x) => x.name).filter(Boolean).join(", ")}</div>
                )}
              </div>
            );
          })}
        </details>
      )}
    </main>
  );
}
