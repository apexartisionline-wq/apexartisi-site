"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Αναδυόμενη ειδοποίηση «σαν του κινητού» μέσα στο Apex (υπεύθυνη 25/10: «ειδοποιήσεις τύπου κινητού — η ομάδα άνοιξε, η ατομική
// συνεδρία ξεκίνησε»). Οι ώρες έρχονται από τη σελίδα· εδώ μόνο ο χρονισμός: εμφανίζεται τη στιγμή που ανοίγει / ξεκινά, χωρίς
// να ξαναρωτά τον server, και ανανεώνει τη σελίδα ώστε και το «Τώρα» να δείξει το κουμπί. Κλείνει με ✕ (μέχρι το επόμενο).
export type LiveEvent = { key: string; from: string; to: string; title: string; button: string; action: string };

export function LiveAlert({ events }: { events: LiveEvent[] }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try { setClosed(JSON.parse(sessionStorage.getItem("apex-live-closed") ?? "[]")); } catch {}
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    // Ακριβώς τη στιγμή που αρχίζει κάθε ειδοποίηση: νέα ώρα και ανανέωση της σελίδας.
    const timers = events
      .map((e) => Date.parse(e.from) - Date.now())
      .filter((ms) => ms > 0 && ms < 12 * 3600_000)
      .map((ms) => setTimeout(() => { setNow(Date.now()); router.refresh(); }, ms + 500));
    return () => { clearInterval(t); timers.forEach(clearTimeout); };
  }, [events, router]);
  const ev = now === null ? undefined : events.find((e) => Date.parse(e.from) <= now && now < Date.parse(e.to) && !closed.includes(e.key));
  useEffect(() => {
    if (ev && "vibrate" in navigator) try { navigator.vibrate(150); } catch {}
  }, [ev?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ev) return null;
  const close = () => {
    const next = [...closed, ev.key];
    setClosed(next);
    try { sessionStorage.setItem("apex-live-closed", JSON.stringify(next)); } catch {}
  };
  return (
    <div className="live-alert" role="alert">
      <span className="live-icon" aria-hidden="true">A</span>
      <span className="live-body"><span className="live-app">Apex · τώρα</span><strong>{ev.title}</strong></span>
      <form action={ev.action} method="post"><button className="primary sm" type="submit">{ev.button}</button></form>
      <button type="button" className="live-close" aria-label="Κλείσιμο" onClick={close}>✕</button>
    </div>
  );
}
