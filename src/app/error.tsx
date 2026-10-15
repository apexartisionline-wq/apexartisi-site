"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

// Σφάλμα στον browser (14/10, μετά τη δοκιμή της υπεύθυνης: «client-side exception» στην πρώτη φόρτωση του «Σήμερα»
// αμέσως μετά από ανέβασμα νέας έκδοσης). Αν φταίει παλιό κομμάτι κώδικα που δεν υπάρχει πια (ChunkLoadError —
// συμβαίνει όταν ανέβει νέα έκδοση ενώ η σελίδα ήταν ανοιχτή), η σελίδα ξαναφορτώνει μόνη της μία φορά.
// Αλλιώς: ένα ήρεμο μήνυμα με «Ξαναφόρτωσε» — ποτέ γυμνό «Application error».
const isStale = (e: Error) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch/i.test(`${e.name} ${e.message}`);

const RETRY_KEY = "apex-retry";
const markRetry = () => { try { sessionStorage.setItem(RETRY_KEY, String(Date.now())); } catch {} };
function retriedJustNow(): boolean {
  let at = 0;
  try { at = Number(sessionStorage.getItem(RETRY_KEY) ?? 0); sessionStorage.removeItem(RETRY_KEY); } catch {}
  return at > 0 && Date.now() - at < 15_000;
}

/** Η εμφάνιση του μηνύματος, χωρίς router (τη χρησιμοποιεί και το global-error). */
export function ErrorView({ error, onRetry, retrying = false }: { error: Error & { digest?: string }; onRetry: () => void; retrying?: boolean }) {
  const [reloading, setReloading] = useState<"" | "version" | "retry">("");
  useEffect(() => {
    console.error("[apex]", error);
    // Η ήπια «Δοκίμασε ξανά» ξανάβγαλε σφάλμα → μία πλήρης φόρτωση της ίδιας σελίδας (το σημάδι σβήνεται πρώτα: ποτέ βρόχος).
    if (retriedJustNow()) { setReloading("retry"); window.location.reload(); return; }
    if (!isStale(error)) return;
    let done = false;
    try { done = sessionStorage.getItem("apex-reloaded") === "1"; } catch {}
    if (done) return;
    try { sessionStorage.setItem("apex-reloaded", "1"); } catch {}
    setReloading("version");
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
          <p className="muted" style={{ margin: 0 }}>{reloading === "version" ? "Ανέβηκε νέα έκδοση· η σελίδα ξαναφορτώνει…" : "Η σελίδα ξαναφορτώνει…"}</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>Δεν χάθηκε τίποτα από όσα είχαν αποθηκευτεί. Συνήθως φτάνει μία ανανέωση.</p>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="primary" onClick={() => window.location.reload()}>Ξαναφόρτωσε</button>
              <button type="button" onClick={onRetry} disabled={retrying}>{retrying ? "Δοκιμάζω…" : "Δοκίμασε ξανά"}</button>
            </div>
            {error.digest && <p className="muted small" style={{ margin: 0 }}>Κωδικός για την ομάδα υποστήριξης: {error.digest}</p>}
          </>
        )}
      </div>
    </main>
  );
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  // «Δοκίμασε ξανά» (15/10): σκέτο reset() ξαναδείχνει τη σελίδα ΧΩΡΙΣ να ξαναζητήσει τα δεδομένα από τον server — μετά από
  // σφάλμα του server δεν άλλαζε τίποτα. Σφάλμα του server (έχει digest): ξαναζητά τα δεδομένα (router.refresh) και ξαναδείχνει
  // τη σελίδα· αν ξαναβγεί σφάλμα, μία πλήρης φόρτωση. Σφάλμα δικτύου (χωρίς digest — π.χ. η απάντηση κόπηκε στη μέση από το
  // όριο χρόνου του Netlify): ο router μένει κολλημένος στη μετάβαση που απέτυχε και δεν ξαναζητά τίποτα, άρα πλήρης φόρτωση.
  const onRetry = () => {
    if (!error.digest) { window.location.reload(); return; }
    markRetry();
    startRetry(() => { router.refresh(); reset(); });
  };
  return <ErrorView error={error} retrying={retrying} onRetry={onRetry} />;
}
