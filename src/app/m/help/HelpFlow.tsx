"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type Status = { claimedByName: string | null; showHelpline: boolean; talked?: boolean };
type Line = { label: string; number: string };

// Κόκκινο κουμπί. «Το πατάς και τελείωσε»: το «Θέλω άνθρωπο» και οι γραμμές βοήθειας
// είναι ορατά από την πρώτη στιγμή. Μετά: το πλάνο ασφάλειας, το μήνυμα από τον εαυτό
// σου (χωρίς αυτόματη αναπαραγωγή) και η αναπνοή.
export function HelpFlow({
  hasSelfMessage,
  helplines,
  plan,
  autoAsk = false,
}: {
  hasSelfMessage: boolean;
  helplines: Line[];
  plan: ReactNode;
  autoAsk?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [danger, setDanger] = useState(false);

  useEffect(() => {
    fetch("/api/help/open", { method: "POST" }).catch(() => undefined);
    // Από το ημερολόγιο: το μέλος απάντησε ήδη «Ναι, να με πάρει κάποιος».
    if (autoAsk) askHuman();
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
      <p className="muted small" style={{ marginTop: 8 }}>Η ομάδα μας δεν είναι υπηρεσία έκτακτης ανάγκης.</p>
    </div>
  );

  const asked = requestId !== null || sending || failed;
  const showLines = danger || failed || status?.showHelpline;

  return (
    <div className="stack">
      {!asked ? (
        <button className="red big" onClick={askHuman}>Θέλω να μιλήσω με άνθρωπο τώρα</button>
      ) : (
        <div className="card" aria-live="polite">
          {sending && <p>Ειδοποιούμε την ομάδα…</p>}
          {failed && <div className="error">Δεν μπορέσαμε να στείλουμε την ειδοποίηση. Κάλεσε μία από τις γραμμές παρακάτω.</div>}
          {status?.talked ? (
            <p><strong>Μιλήσατε ✓</strong> Είμαστε εδώ και αύριο.</p>
          ) : status?.claimedByName ? (
            <p>
              <strong>Ο/η {status.claimedByName} σε παίρνει τώρα.</strong>
              <br />
              <span className="muted small">Μπορεί να σε καλέσει από αριθμό που δεν γνωρίζεις.</span>
            </p>
          ) : (
            !sending && !failed && <p>Η ομάδα ειδοποιήθηκε. Κάποιος θα σε πάρει σύντομα. Αν δεν μπορείς να περιμένεις, κάλεσε τώρα.</p>
          )}
        </div>
      )}

      {!danger && !showLines && (
        <button onClick={() => setDanger(true)}>Κινδυνεύεις τώρα; Πάτα εδώ</button>
      )}
      {showLines ? lines : (
        <details>
          <summary className="small">Γραμμές βοήθειας</summary>
          {lines}
        </details>
      )}

      {plan && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Το πλάνο σου</h2>
          {plan}
        </section>
      )}

      {hasSelfMessage && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Ένα μήνυμα από σένα</h2>
          <p className="muted small">Βάλε ακουστικά αν είσαι σε δημόσιο χώρο.</p>
          <audio controls preload="none" src="/api/self-message" style={{ width: "100%" }} />
        </section>
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
      {!asked && <Link className="btn big" href="/m">Είμαι καλύτερα</Link>}
    </div>
  );
}
