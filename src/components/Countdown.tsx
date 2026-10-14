"use client";

import { useEffect, useState } from "react";

// Χρονόμετρο της «Προετοιμασίας» (υπεύθυνη 14/10): ο θεραπευτής διαβάζει το σημείωμα και ξέρει πάντα πόσο
// μένει· στα τελευταία 2 λεπτά η ένδειξη αλλάζει («Σε 2′ αρχίζει η ατομική σου — ώρα να μπεις») για να μη
// ξεχαστεί στο διάβασμα. Το κείμενο του server (`initial`) φαίνεται ώσπου να ξεκινήσει το ρολόι του browser.
const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Countdown({ startsAt, endsAt, what, initial }: { startsAt: string; endsAt: string; what: string; initial: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  let text = initial;
  let tone = "";
  let small = "";
  if (now !== null) {
    const diff = s - now;
    if (diff > 0) {
      const mins = Math.floor(diff / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      if (diff <= 2 * 60_000) { text = `Σε ${mins}′ ${pad(secs)}″ αρχίζει ${what}`; small = "Ώρα να μπεις."; tone = "now"; }
      else if (diff <= 15 * 60_000) { text = `Ξεκινά σε ${mins}′ ${pad(secs)}″`; tone = "soon"; }
      else if (diff <= 24 * 3600_000) { const h = Math.floor(mins / 60); text = h > 0 ? `Ξεκινά σε ${h} ${h === 1 ? "ώρα" : "ώρες"} και ${mins % 60}′` : `Ξεκινά σε ${mins}′`; }
    } else if (now <= e) {
      const mins = Math.floor(-diff / 60_000);
      text = `${cap(what)} ξεκίνησε${mins > 0 ? ` πριν ${mins}′` : ""}`; small = "Μπες τώρα."; tone = "live";
    } else {
      text = `${cap(what)} τελείωσε`; tone = "over";
    }
  }
  // Και στον τίτλο της καρτέλας, για όποιον έχει ανοίξει το Zoom ή άλλη σελίδα δίπλα.
  useEffect(() => {
    if (now === null) return;
    const diff = s - now;
    if (diff > 0 && diff <= 15 * 60_000) document.title = `${Math.floor(diff / 60_000)}′ ${pad(Math.floor((diff % 60_000) / 1000))}″ · Apex`;
    else if (diff <= 0 && now <= e) document.title = "Ξεκίνησε · Apex";
  }, [now, s, e]);
  return (
    <div className={`prep-count${tone ? ` ${tone}` : ""}`} role="status" aria-live="polite" data-tone={tone || "far"}>
      <span className="prep-count-text">{text}</span>
      {small && <span className="prep-count-small">{small}</span>}
    </div>
  );
}
