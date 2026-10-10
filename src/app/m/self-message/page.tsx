import { requireRole } from "@/lib/auth";
import { hasConsent } from "@/lib/intake";
import { Recorder } from "./Recorder";

export default async function SelfMessagePage() {
  const user = await requireRole("MEMBER");
  if (!(await hasConsent(user.id, "self_message"))) {
    return (
      <main>
        <h1>Μήνυμα από τον εαυτό σου</h1>
        <p>Για να ηχογραφήσεις μήνυμα χρειάζεται η συγκατάθεσή σου. Το κάνεις μαζί με την ομάδα στην ατομική σου.</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Μήνυμα από τον εαυτό σου</h1>
      <p>
        Ηχογράφησε με δικά σου λόγια τι θέλεις να ακούσεις μια δύσκολη στιγμή. Θα το ακούς πρώτο όταν πατάς το
        κόκκινο κουμπί. Το ακούς μόνο εσύ.
      </p>
      <Recorder hasExisting={Boolean(user.selfMessageType)} />
    </main>
  );
}
