import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { HelpFlow } from "./HelpFlow";

export default async function HelpPage() {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  return (
    <main>
      <HelpFlow hasSelfMessage={Boolean(user.selfMessageType)} helplineText={s.helplineText} />
    </main>
  );
}
