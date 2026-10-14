"use client";

import { useEffect, useState } from "react";

// Σφάλμα στον browser (14/10, μετά τη δοκιμή της υπεύθυνης: «client-side exception» στην πρώτη φόρτωση του «Σήμερα»
// αμέσως μετά από ανέβασμα νέας έκδοσης). Αν φταίει παλιό κομμάτι κώδικα που δεν υπάρχει πια (ChunkLoadError —
// συμβαίνει όταν ανέβει νέα έκδοση ενώ η σελίδα ήταν ανοιχτή), η σελίδα ξαναφορτώνει μόνη της μία φορά.
// Αλλιώς: ένα ήρεμο μήνυμα με «Ξαναφόρτωσε» — ποτέ γυμνό «Application error».
const isStale = (e: Error) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch/i.test(`${e.name} ${e.message}`);

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    console.error("[apex]", error);
    if (!isStale(error)) return;
    let done = false;
    try { done = sessionStorage.getItem("apex-reloaded") === "1"; } catch {}
    if (done) return;
    try { sessionStorage.setItem("apex-reloaded", "1"); } catch {}
    setReloading(true);
    window.location.reload();
  }, [error]);
  useEffect(() => {
    // Μετά από επιτυχή φόρτωση το «ξαναφόρτωσα» ξεχνιέται, ώστε να ξαναδουλέψει στην επόμενη νέα έκδοση.
    const t = setTimeout(() => { try { sessionStorage.removeItem("apex-reloaded"); } catch {} }, 30_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main>
      <h1>Κάτι δεν φόρτωσε σωστά</h1>
      <div className="card stack">
        {reloading ? (
          <p className="muted" style={{ margin: 0 }}>Ανέβηκε νέα έκδοση· η σελίδα ξαναφορτώνει…</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>Δεν χάθηκε τίποτα από όσα είχαν αποθηκευτεί. Συνήθως φτάνει μία ανανέωση.</p>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="primary" onClick={() => window.location.reload()}>Ξαναφόρτωσε</button>
              <button type="button" onClick={reset}>Δοκίμασε ξανά</button>
            </div>
            {error.digest && <p className="muted small" style={{ margin: 0 }}>Κωδικός για την ομάδα υποστήριξης: {error.digest}</p>}
          </>
        )}
      </div>
    </main>
  );
}
