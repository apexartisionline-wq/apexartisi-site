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
      <PageHead title="Κόκκινο κουμπί" />
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
