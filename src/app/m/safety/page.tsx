import { RedirectType, redirect } from "next/navigation";
import { PageHead } from "@/components/ui";
import { SafetyPlanForm, SafetyPlanView } from "@/components/SafetyPlanForm";
import { requireRole } from "@/lib/auth";
import { getPlan, hasPlanContent, missingSections, savePlan } from "@/lib/safety";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  await savePlan(user.id, formData, user.id);
  redirect("/m/safety?ok=1", RedirectType.replace);
}

// «Το πλάνο μου όταν δυσκολεύομαι»: το μέλος το ανοίγει από το μενού, όποτε θέλει, χωρίς να πατήσει το κόκκινο κουμπί.
// Πρώτα τα δικά του λόγια σε κάρτες· η φόρμα από κάτω, για αλλαγές. Τα τηλέφωνα είναι δικά του: εδώ τα βλέπει και τα καλεί.
export default async function MySafetyPlan({ searchParams }: { searchParams: Promise<{ ok?: string; edit?: string }> }) {
  const user = await requireRole("MEMBER");
  const [plan, sp] = await Promise.all([getPlan(user.id), searchParams]);
  if (!plan) redirect("/m");
  const filled = hasPlanContent(plan);
  const missing = missingSections(plan);
  return (
    <main>
      <PageHead title="Το πλάνο μου όταν δυσκολεύομαι" sub="Το γράψαμε μαζί σε μια ατομική. Το βλέπεις πρώτο όταν πατάς το κόκκινο κουμπί. Μπορείς να το αλλάζεις." />
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {filled ? <SafetyPlanView plan={plan} canCall /> : <p className="muted">Δεν έχει γραφτεί κάτι ακόμα.</p>}
      {missing.length > 0 && (
        <p className="hint" style={{ marginTop: 12 }}>
          {filled ? "Κάποιες ερωτήσεις είναι ακόμα κενές. " : ""}Μπορείς να το συμπληρώσεις στην επόμενη ατομική, μαζί με την ομάδα σου — ή εδώ, όποτε θέλεις.
        </p>
      )}
      <details className="fold" open={!filled || sp.edit === "1"} style={{ marginTop: 16 }}>
        <summary>Άλλαξε ή συμπλήρωσε το πλάνο</summary>
        <SafetyPlanForm plan={plan} action={save} />
      </details>
    </main>
  );
}
