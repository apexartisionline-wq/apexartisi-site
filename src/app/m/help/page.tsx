import { requireRole } from "@/lib/auth";
import { getPlan } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { SafetyPlanView } from "@/components/SafetyPlanForm";
import { HelpFlow } from "./HelpFlow";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const user = await requireRole("MEMBER");
  const [s, plan, sp] = await Promise.all([getSettings(), getPlan(user.id), searchParams]);
  const hasPlan = plan && Object.entries(plan).some(([k, v]) => (k === "helperList" ? (v as unknown[]).length > 0 : Boolean(v)));
  return (
    <main>
      <HelpFlow
        autoAsk={sp.ask === "1"}
        hasSelfMessage={Boolean(user.selfMessageType)}
        helplines={s.helplines}
        crisisNotice={s.crisisNotice}
        plan={hasPlan ? <SafetyPlanView plan={plan} /> : null}
      />
    </main>
  );
}
