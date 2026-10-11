import { requireRole } from "@/lib/auth";
import { hasConsent } from "@/lib/intake";
import { Recorder } from "./Recorder";

export default async function SelfMessagePage() {
  const user = await requireRole("MEMBER");
  if (!(await hasConsent(user.id, "self_message"))) {
    return (
      <main>
        <h1>Μήνυμα για τον εαυτό σου</h1>
        <p>Το μήνυμα δεν είναι ανοιχτό για σένα, γιατί δεν έχεις πει «ναι» γι' αυτό. Αν το θέλεις, μίλα με την ομάδα στην ατομική σου.</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Μήνυμα για τον εαυτό σου</h1>
      <p>
        Ηχογράφησε με δικά σου λόγια τι θέλεις να ακούσεις σε μια δύσκολη στιγμή. Θα το ακούς πρώτο όταν πατάς το
        κόκκινο κουμπί. Το ακούς μόνο εσύ.
      </p>
      <Recorder hasExisting={Boolean(user.selfMessageType)} />
    </main>
  );
}
