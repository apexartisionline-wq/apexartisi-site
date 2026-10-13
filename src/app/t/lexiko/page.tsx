import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { GUIDE } from "@/lib/guide";
import { GuideSearch } from "./GuideSearch";

// «Οδηγός ομάδας» (παλιό «Λεξιλόγιο», ίδιο path για να μη σπάσουν σύνδεσμοι): σύντομες απαντήσεις,
// μόνο από τους κανόνες της ομάδας. Τα κείμενα είναι στο src/lib/guide.ts.
export default async function TeamGuide() {
  await requireRole("THERAPIST", "ADMIN");
  return (
    <main>
      <p className="crumbs"><Link href="/t">Σήμερα</Link> <span>/</span> <span>Οδηγός ομάδας</span></p>
      <div className="page-head">
        <div>
          <h1>Οδηγός ομάδας</h1>
          <p className="page-sub">Οι λέξεις και οι κανόνες της ομάδας, σε λίγες γραμμές. Πάτα ένα θέμα για να ανοίξει.</p>
        </div>
      </div>
      <GuideSearch sections={GUIDE} />
    </main>
  );
}
