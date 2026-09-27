import { requireRole } from "@/lib/auth";
import { getPlan } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { SafetyPlanView } from "@/components/SafetyPlanForm";
import { HelpFlow } from "./HelpFlow";

export default async function HelpPage() {
  const user = await requireRole("MEMBER");
  const [s, plan] = await Promise.all([getSettings(), getPlan(user.id)]);
  const hasPlan = plan && Object.values(plan).some(Boolean);
  return (
    <main>
      <HelpFlow
        hasSelfMessage={Boolean(user.selfMessageType)}
        helplines={s.helplines}
        plan={hasPlan ? <SafetyPlanView plan={plan} /> : null}
      />
    </main>
  );
}
