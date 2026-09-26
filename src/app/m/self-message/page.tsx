import { requireRole } from "@/lib/auth";
import { Recorder } from "./Recorder";

export default async function SelfMessagePage() {
  const user = await requireRole("MEMBER");
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
