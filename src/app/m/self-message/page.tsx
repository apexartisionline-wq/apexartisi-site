import { PageHead, Panel } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { hasConsent } from "@/lib/intake";
import { Recorder } from "./Recorder";

export default async function SelfMessagePage() {
  const user = await requireRole("MEMBER");
  if (!(await hasConsent(user.id, "self_message"))) {
    return (
      <main>
        <PageHead title="Μήνυμα για τον εαυτό σου" />
        <Panel><p style={{ margin: 0 }}>Το μήνυμα δεν είναι ανοιχτό για σένα, γιατί δεν έχεις πει «ναι» γι' αυτό. Αν το θέλεις, μίλα με την ομάδα σου στην ατομική σου.</p></Panel>
      </main>
    );
  }
  return (
    <main>
      <PageHead title="Μήνυμα για τον εαυτό σου" sub="Θα το ακούς πρώτο όταν πατάς το κόκκινο κουμπί. Το ακούς μόνο εσύ." />
      <p>Ηχογράφησε με δικά σου λόγια τι θέλεις να ακούσεις σε μια δύσκολη στιγμή.</p>
      <Recorder hasExisting={Boolean(user.selfMessageType)} />
    </main>
  );
}
