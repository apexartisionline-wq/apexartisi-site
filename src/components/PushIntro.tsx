"use client";

import { useEffect, useState } from "react";
import { PushToggle } from "./PushToggle";

// Πρώτη φορά στο «Σήμερα» (υπεύθυνη 25/10): οι ειδοποιήσεις στο κινητό είναι επιλογή του μέλους, για λόγους ιδιωτικότητας·
// του το λέμε και τις ανοίγει μόνο αν θέλει. Ανά συσκευή (οι ειδοποιήσεις είναι ανά συσκευή)· δεν ξαναβγαίνει μετά το
// «Εντάξει» ή αν είναι ήδη ανοιχτές.
export function PushIntro({ vapidKey }: { vapidKey: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem("apex-push-intro") === "done"; } catch {}
    if (seen) return;
    (async () => {
      try {
        const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/sw.js") : undefined;
        if (await reg?.pushManager.getSubscription()) return;
      } catch {}
      setShow(true);
    })();
  }, []);
  if (!show) return null;
  const done = () => { try { localStorage.setItem("apex-push-intro", "done"); } catch {} setShow(false); };
  return (
    <div className="panel push-intro">
      <strong>Ειδοποιήσεις στο κινητό: εσύ αποφασίζεις</strong>
      <p className="hint" style={{ margin: "4px 0 10px" }}>
        Για τη δική σου ιδιωτικότητα, οι ειδοποιήσεις είναι κλειστές. Αν τις ανοίξεις, θα σου θυμίζουμε την ομάδα και την ατομική σου
        με ουδέτερα μηνύματα, όπως «Η ομάδα σου άνοιξε» — ποτέ τι γράφεις ή τι συζητάμε. Τις αλλάζεις όποτε θέλεις από τον «Λογαριασμό».
      </p>
      <PushToggle vapidKey={vapidKey} />
      <button type="button" className="btn outline sm" style={{ marginTop: 8 }} onClick={done}>Εντάξει</button>
    </div>
  );
}
