import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound, redirect } from "next/navigation";
import { SafetyPlanForm, SafetyPlanView } from "@/components/SafetyPlanForm";
import { TwoPlans } from "@/components/TwoPlans";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { historyOf } from "@/lib/history";
import { HELPERS_LABEL, PLAN_FIELDS, type PlanData, getPlanWithMeta, hasPlanContent, lastDiscussed, lastReviewAt, markPlanDiscussed, missingSections, planForStaff, planHelpers, savePlan } from "@/lib/safety";
import { formatWhen } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true } }))) notFound();
  await savePlan(id, formData, user.id, user.role !== "ADMIN");
  await logAccess(user.id, id, "safety_plan_edit");
  redirect(`/t/members/${id}/safety?ok=1`);
}

// «Το συζητήσαμε σήμερα με το μέλος»: μία γραμμή (ποιος, πότε) μέσα στο πλάνο, μόνο προσθήκη. Καταγράφεται και η πρόσβαση.
async function discussed(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true } }))) notFound();
  const ok = await markPlanDiscussed(id, { id: user.id, name: user.name });
  if (ok) await logAccess(user.id, id, "safety_plan_discussed");
  redirect(`/t/members/${id}/safety?${ok ? "discussed=1" : "noplan=1"}`);
}

// Το πλάνο του μέλους όταν δυσκολεύεται (Α), όπως το βλέπει/γράφει ο θεραπευτής (μόνο ονόματα) ή η διαχείριση (και τηλέφωνα).
export default async function MemberSafetyPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; discussed?: string; noplan?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "safety_plan_view");
  const meta = await getPlanWithMeta(id);
  const raw = meta?.plan ?? null;
  // Οι θεραπευτές δεν βλέπουν τηλέφωνα· η διαχείριση βλέπει όλο το πλάνο.
  const admin = user.role === "ADMIN";
  const plan = admin ? raw : planForStaff(raw);
  const older = await historyOf("safety_plan", { memberId: id });
  const show = (p: PlanData) => (admin ? p : planForStaff(p)!);
  const missing = missingSections(raw);
  const review = lastReviewAt(meta?.updatedAt, raw);
  const last = lastDiscussed(raw);
  const talks = [...(raw?.discussed ?? [])].reverse();
  const filled = hasPlanContent(raw);

  return (
    <main className="wide">
      <p className="crumbs" style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="safety" />
      <div className="page-head">
        <div>
          <h1>Το πλάνο όταν δυσκολεύεται</h1>
          <p className="page-sub">{member.name} · γραμμένο μαζί στην ατομική, με τα λόγια του μέλους</p>
        </div>
        {raw && (
          <form action={discussed} className="head-actions">
            <input type="hidden" name="memberId" value={id} />
            <button className="btn primary" type="submit">Το συζητήσαμε σήμερα με το μέλος</button>
          </form>
        )}
      </div>

      <TwoPlans memberId={id} here="plan" />

      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.discussed && <div className="notice">Σημειώθηκε ότι συζητήθηκε με το μέλος ✓ ({user.name}, {formatWhen(new Date())})</div>}
      {sp.noplan && <div className="notice">Δεν υπάρχει πλάνο ακόμα — γράψε το πρώτα μαζί με το μέλος.</div>}

      <div className="cols cols-60" style={{ marginTop: 16 }}>
        <div className="stackv">
          <div className="panel">
            <div className="panel-head">
              <h2>Πού βρίσκεται</h2>
              {raw ? (
                missing.length === 0 ? <span className="pill ok">Και οι 7 ερωτήσεις συμπληρωμένες</span> : <span className="pill yellow">Λείπουν {missing.length} από 7</span>
              ) : (
                <span className="pill grey">Δεν έχει γραφτεί</span>
              )}
            </div>
            <div className="kv"><span>Τελευταία ανασκόπηση</span><span>{review ? formatWhen(review) : "—"}</span></div>
            <div className="kv"><span>Συζητήθηκε με το μέλος</span><span>{last ? `${formatWhen(new Date(last.at))} · ${last.byName}` : "δεν έχει σημειωθεί"}</span></div>
            <div className="kv"><span>Τελευταία αλλαγή</span><span>{meta ? formatWhen(meta.updatedAt) : "—"}</span></div>
            {missing.length > 0 && raw && <p className="hint" style={{ marginTop: 8 }}>Λείπουν: {missing.join(" · ")}</p>}
            {raw?.helpers && (
              <p className="hint" style={{ marginTop: 8 }}>
                Στο «{HELPERS_LABEL}» υπάρχει παλιότερη καταχώρηση σε ελεύθερο κείμενο. Να περάσει στα ονόματα από άνθρωπο, μέσα στην ατομική — δεν ταξινομείται αυτόματα.
              </p>
            )}
          </div>

          <div className="panel">
            <h2>{raw ? "Γράψτε ή αλλάξτε το μαζί" : "Γράψτε το μαζί"}</h2>
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>Προσωπικές, συγκεκριμένες απαντήσεις. Κάθε αποθήκευση κρατά όνομα και ώρα· η παλιά μορφή μένει στο ιστορικό.</p>
            <SafetyPlanForm plan={plan} action={save} hidden={{ memberId: id }} staff={!admin} />
          </div>
        </div>

        <div className="stackv">
          <div className="panel">
            <details className="fold" open>
              <summary>Πώς το βλέπει το μέλος</summary>
              <p className="hint" style={{ margin: "4px 0 10px" }}>Η ίδια διάταξη με το κινητό του μέλους. Τα τηλέφωνα εδώ είναι κρυφά («•••») και δεν υπάρχει κουμπί κλήσης.</p>
              {filled ? <SafetyPlanView plan={planForStaff(raw)!} canCall={false} /> : <div className="empty">Δεν έχει γραφτεί κάτι ακόμα.</div>}
            </details>
          </div>

          <div className="panel">
            <details className="fold">
              <summary>Πότε συζητήθηκε με το μέλος ({talks.length})</summary>
              {talks.length === 0 ? (
                <div className="empty">Δεν έχει σημειωθεί ακόμα. Πάτα «Το συζητήσαμε σήμερα με το μέλος» μετά την ατομική.</div>
              ) : (
                talks.map((t, i) => (
                  <div className="kv" key={i}><span>{formatWhen(new Date(t.at))}</span><span>{t.byName}</span></div>
                ))
              )}
            </details>
          </div>

          {older.length > 0 && (
            <div className="panel small">
              <details className="fold">
                <summary>Προηγούμενες μορφές ({older.length})</summary>
                {older.map((h, i) => {
                  const p = show((h.before as { data: PlanData }).data ?? {});
                  const names = planHelpers(p).map((x) => x.name).filter(Boolean);
                  return (
                    <div key={i} style={{ marginTop: 12 }}>
                      <div className="muted">Πριν από την αλλαγή της {formatWhen(h.at)} · {h.by}</div>
                      {PLAN_FIELDS.filter((f) => p[f.key]).map((f) => <div key={f.key}><strong>{f.label}</strong> {p[f.key]}</div>)}
                      {names.length > 0 && <div><strong>{HELPERS_LABEL}</strong> {names.join(", ")}</div>}
                      {p.helpers && <div><strong>Παλιότερη καταγραφή:</strong> {p.helpers}</div>}
                    </div>
                  );
                })}
              </details>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
