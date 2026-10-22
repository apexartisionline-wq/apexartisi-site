import { requireRole } from "@/lib/auth";
import { getPlan, hasPlanContent } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { SafetyPlanView } from "@/components/SafetyPlanForm";
import { PageHead } from "@/components/ui";
import { HelpFlow } from "./HelpFlow";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const user = await requireRole("MEMBER");
  const [s, plan, sp] = await Promise.all([getSettings(), getPlan(user.id), searchParams]);
  return (
    <main className="help">
      {/* Ζεστή γραμμή (υπεύθυνη 22/10, ιδέα από το Wysa): χωρίς γένος, χωρίς υπόσχεση χρόνου — το τι ΔΕΝ υποσχόμαστε
          μένει στο crisisNotice του νομικού. Η σειρά της σελίδας (απόφαση 10/10) δεν αλλάζει. */}
      <PageHead title="Κόκκινο κουμπί" sub="Η ομάδα σου είναι εδώ." />
      <HelpFlow
        autoAsk={sp.ask === "1"}
        hasSelfMessage={Boolean(user.selfMessageType)}
        helplines={s.helplines}
        crisisNotice={s.crisisNotice}
        // Το μέλος βλέπει τα δικά του τηλέφωνα και μπορεί να καλέσει από εδώ.
        plan={plan && hasPlanContent(plan) ? <SafetyPlanView plan={plan} canCall /> : null}
      />
    </main>
  );
}
