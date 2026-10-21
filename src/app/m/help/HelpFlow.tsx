"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type Status = { claimedByName: string | null; showHelpline: boolean; talked?: boolean };
type Line = { label: string; number: string };

// Κόκκινο κουμπί (σειρά, απόφαση 10/10): πρώτα το πλάνο του μέλους και το μήνυμα από τον εαυτό του (χωρίς αυτόματη
// αναπαραγωγή), μετά «Θέλω να μιλήσω με άνθρωπο τώρα», «Κινδυνεύεις τώρα;» και οι γραμμές βοήθειας (κλειστές μέχρι να
// χρειαστούν), στο τέλος η αναπνοή. Μετά από ανανέωση της σελίδας η ανοιχτή κατάσταση ξαναφορτώνεται από το /api/help/open.
export function HelpFlow({
  hasSelfMessage,
  helplines,
  crisisNotice,
  plan,
  autoAsk = false,
}: {
  hasSelfMessage: boolean;
  helplines: Line[];
  crisisNotice: string;
  plan: ReactNode;
  autoAsk?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [danger, setDanger] = useState(false);

  useEffect(() => {
    // Το ?ask=1 (από το ημερολόγιο) φεύγει από τη διεύθυνση αμέσως, για να μην ξαναστείλει αίτημα σε ανανέωση ή «πίσω».
    if (autoAsk && typeof window !== "undefined") window.history.replaceState(null, "", "/m/help");
    (async () => {
      let open: Status & { id: string } | null = null;
      try {
        const res = await fetch("/api/help/open", { method: "POST" });
        if (res.ok) open = (await res.json()).open ?? null;
      } catch { /* η καταγραφή του ανοίγματος δεν εμποδίζει τίποτα */ }
      if (open) {
        // Υπάρχει ήδη ανοιχτό αίτημα (π.χ. ανανέωση της σελίδας): δείχνουμε την κατάστασή του αντί για νέο πάτημα.
        setRequestId(open.id);
        setStatus(open);
      } else if (autoAsk) {
        // Από το ημερολόγιο: το μέλος απάντησε ήδη «Ναι, να με πάρει κάποιος».
        askHuman();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askHuman() {
    setSending(true);
    try {
      const res = await fetch("/api/help", { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRequestId(json.id);
      setStatus(json);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!requestId) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/help/${requestId}`, { cache: "no-store" });
        if (res.ok) setStatus(await res.json());
      } catch {
        /* ξαναδοκιμάζει στο επόμενο */
      }
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [requestId]);

  const lines = (
    <div className="card" style={{ borderColor: "var(--red)" }}>
      <strong>Αν κινδυνεύεις τώρα, μην περιμένεις — κάλεσε:</strong>
      <div className="stack" style={{ marginTop: 8 }}>
        {helplines.map((l) => (
          <a key={l.number} className={`btn${l.number === "112" ? " red" : ""}`} href={`tel:${l.number}`}>
            {l.number} · {l.label}
          </a>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>{crisisNotice}</p>
    </div>
  );

  const asked = requestId !== null || sending || failed;
  const showLines = danger || failed || status?.showHelpline;

  return (
    <div className="stack">
      {/* Πρώτα το δικό του: το πλάνο και το μήνυμα από τον εαυτό του (απόφαση 10/10 — «θα το βλέπεις πρώτο»)· μετά η ομάδα και οι γραμμές. */}
      {plan ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Το πλάνο σου</h2>
          <p className="muted small" style={{ marginTop: -4 }}>Με τα δικά σου λόγια, όπως το γράψατε μαζί. <Link href="/m/safety?edit=1">Άλλαξέ το ›</Link></p>
          {plan}
        </section>
      ) : (
        /* Χωρίς πλάνο ακόμα (γράφεται μαζί στη 2η ατομική, 17/10): το λέμε, δεν το ζητάμε από το μέλος μόνο του. Διατύπωση προς έγκριση (21/10). */
        <p className="muted small" style={{ margin: 0 }}>Το πλάνο σου το γράφετε μαζί στην ατομική σου.</p>
      )}

      {hasSelfMessage && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Ένα μήνυμα από σένα</h2>
          <p className="muted small">Βάλε ακουστικά αν είσαι σε δημόσιο χώρο.</p>
          <audio controls preload="none" src="/api/self-message" style={{ width: "100%" }} />
        </section>
      )}

      {!asked ? (
        <section>
          {/* Τι κάνει το κουμπί, με ακρίβεια (src/lib/help.ts): ειδοποίηση στην ομάδα, ανάληψη από κάποιον, επανάληψη
              αν δεν απαντήσει κανείς και εμφάνιση των γραμμών βοήθειας. Χωρίς υποσχέσεις χρόνου. */}
          <p className="muted small" style={{ margin: "0 0 8px" }}>
            Το κουμπί ειδοποιεί την ομάδα σου. Κάποιος θα σε πάρει τηλέφωνο. Αν δεν απαντήσει κανείς, η ειδοποίηση ξαναστέλνεται και σου δείχνουμε τις γραμμές βοήθειας.
          </p>
          <button className="red big" onClick={askHuman}>Θέλω να μιλήσω με άνθρωπο τώρα</button>
        </section>
      ) : (
        <div className="card" aria-live="polite">
          {sending && <p>Ειδοποιούμε την ομάδα…</p>}
          {failed && <div className="error">Δεν μπορέσαμε να στείλουμε την ειδοποίηση. Κάλεσε μία από τις γραμμές παρακάτω.</div>}
          {status?.talked ? (
            <p><strong>Μιλήσατε ✓</strong> Είμαστε εδώ και αύριο.</p>
          ) : status?.claimedByName ? (
            <p>
              <strong>Σε παίρνει τώρα: {status.claimedByName}.</strong>
              <br />
              <span className="muted small">Μπορεί να σε καλέσει από άγνωστο αριθμό — σήκωσέ το.</span>
            </p>
          ) : (
            !sending && !failed && <p>Η ομάδα ειδοποιήθηκε. Κάποιος θα σε πάρει σύντομα. Αν δεν μπορείς να περιμένεις, κάλεσε τώρα.</p>
          )}
        </div>
      )}

      {!danger && !showLines && (
        <button className="outline big" onClick={() => setDanger(true)}>Κινδυνεύεις τώρα; Πάτα εδώ</button>
      )}
      {showLines ? lines : (
        <details className="fold">
          <summary>Γραμμές βοήθειας</summary>
          {lines}
        </details>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Ανάσα</h2>
        <div className="breath" aria-hidden />
        <p style={{ textAlign: "center" }}>
          Ανάσα μέσα όσο μεγαλώνει ο κύκλος (4″). Κράτα (4″). Άφησέ την αργά όσο μικραίνει (6″).
        </p>
      </section>

      {!hasSelfMessage && (
        <p className="muted small">Δεν έχεις ηχογραφήσει ακόμα μήνυμα για τον εαυτό σου. <Link href="/m/self-message">Ηχογράφησέ το</Link>.</p>
      )}
      {!asked ? <Link className="btn big" href="/m">Είμαι καλύτερα</Link> : <Link className="btn big" href="/m">Πίσω στο «Σήμερα»</Link>}
    </div>
  );
}
