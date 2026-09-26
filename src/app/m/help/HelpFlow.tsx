"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = { claimedByName: string | null; showHelpline: boolean };

// Τρία βήματα, ώστε να μην απομείνει ποτέ κανείς χωρίς απάντηση:
// 1) μήνυμα από τον εαυτό σου, 2) αναπνοή, 3) άνθρωπος (Telegram θεραπευτών).
// Το «Θέλω να μιλήσω με άνθρωπο» είναι διαθέσιμο σε κάθε βήμα.
export function HelpFlow({ hasSelfMessage, helplineText }: { hasSelfMessage: boolean; helplineText: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(hasSelfMessage ? 1 : 2);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function askHuman() {
    setSending(true);
    setStep(3);
    try {
      const res = await fetch("/api/help", { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRequestId(json.id);
      setStatus(json.status);
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

  const helpline = (
    <div className="card" style={{ borderColor: "var(--red)" }}>
      <strong>Αν χρειάζεσαι βοήθεια αμέσως</strong>
      <p className="body-text">{helplineText}</p>
      <a className="btn red" href="tel:112">Κάλεσε το 112</a>
    </div>
  );

  if (step === 3) {
    return (
      <div className="stack">
        <h1>Είμαστε εδώ</h1>
        {sending && <p>Ειδοποιούμε την ομάδα…</p>}
        {failed && (
          <>
            <div className="error">Δεν μπορέσαμε να στείλουμε την ειδοποίηση.</div>
            {helpline}
          </>
        )}
        {status?.claimedByName ? (
          <div className="notice"><strong>Ο/η {status.claimedByName} σε παίρνει τώρα.</strong></div>
        ) : (
          !sending && !failed && <div className="notice">Η ομάδα ειδοποιήθηκε. Κάποιος θα σε πάρει σύντομα. Μείνε εδώ.</div>
        )}
        {status?.showHelpline && !status.claimedByName && helpline}
        <div className="breath" aria-hidden />
        <p className="muted" style={{ textAlign: "center" }}>Ανάσα μέσα όσο μεγαλώνει ο κύκλος, έξω όσο μικραίνει.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>{step === 1 ? "Ένα μήνυμα από σένα" : "Ανάσα"}</h1>
      {step === 1 ? (
        <>
          <p>Άκου τι είχες πει στον εαυτό σου.</p>
          <audio controls autoPlay src="/api/self-message" style={{ width: "100%" }} />
          <button className="primary big" onClick={() => setStep(2)}>Συνέχεια</button>
        </>
      ) : (
        <>
          <div className="breath" aria-hidden />
          <p style={{ textAlign: "center" }}>
            Ανάσα μέσα από τη μύτη όσο μεγαλώνει ο κύκλος (4″).<br />
            Κράτα (4″).<br />
            Άφησέ την αργά από το στόμα όσο μικραίνει (6″).
          </p>
          {!hasSelfMessage && (
            <p className="muted small">
              Δεν έχεις ηχογραφήσει ακόμα μήνυμα για τον εαυτό σου. <Link href="/m/self-message">Ηχογράφησέ το</Link>.
            </p>
          )}
          <Link className="btn big" href="/m">Είμαι καλύτερα</Link>
        </>
      )}
      <button className="red big" onClick={askHuman}>Θέλω να μιλήσω με άνθρωπο</button>
    </div>
  );
}
