"use client";

import { useEffect, useState } from "react";

// «Βάλε το Apex στο κινητό σου» (υπεύθυνη 25/10: «μπορούμε να το κάνουμε με βήματα να το δείχνουμε»).
// Το Apex είναι εφαρμογή ιστού: μπαίνει στην αρχική οθόνη από τον browser, όχι από App Store / Google Play.
// Διαλέγει μόνο του iPhone ή Android από τη συσκευή· τα δύο κουμπιά μένουν για όποιον το δείχνει σε άλλον.
type Os = "ios" | "android";
type Step = { art: React.ReactNode; title: string; text: string };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Art = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <div className="ig-art" aria-hidden="true">
    <svg viewBox="0 0 48 48" width="40" height="40">{children}</svg>
    {label && <span>{label}</span>}
  </div>
);
const globe = <g {...stroke}><circle cx="24" cy="24" r="15" /><path d="M9 24h30M24 9c5 5 5 25 0 30M24 9c-5 5-5 25 0 30" /></g>;
const share = <g {...stroke}><path d="M17 20h-3v18h20V20h-3" /><path d="M24 30V8m-6 6 6-6 6 6" /></g>;
const plusSquare = <g {...stroke}><rect x="10" y="10" width="28" height="28" rx="7" /><path d="M24 17v14M17 24h14" /></g>;
const kebab = <g fill="currentColor"><circle cx="24" cy="12" r="3.2" /><circle cx="24" cy="24" r="3.2" /><circle cx="24" cy="36" r="3.2" /></g>;
const install = <g {...stroke}><rect x="12" y="6" width="24" height="36" rx="5" /><path d="M24 15v13m-5-5 5 5 5-5M20 36h8" /></g>;
const tap = <g {...stroke}><rect x="10" y="10" width="28" height="28" rx="8" /><circle cx="24" cy="24" r="6" /></g>;
const bell = <g {...stroke}><path d="M14 33V22a10 10 0 0 1 20 0v11l3 3H11z" /><path d="M21 39a3 3 0 0 0 6 0" /></g>;

const STEPS: Record<Os, Step[]> = {
  ios: [
    { art: <Art label="Safari">{globe}</Art>, title: "Άνοιξε το Apex στο Safari", text: "Μόνο από το Safari γίνεται στο iPhone. Αν το άνοιξες από email ή μήνυμα, πάτα «Άνοιγμα στο Safari»." },
    { art: <Art>{share}</Art>, title: "Πάτα «Κοινή χρήση»", text: "Το τετράγωνο με το βελάκι προς τα πάνω, στο κάτω μέρος της οθόνης (ή δίπλα στη διεύθυνση)." },
    { art: <Art>{plusSquare}</Art>, title: "«Προσθήκη στην οθόνη Αφετηρίας»", text: "Κατέβα λίγο στη λίστα που ανοίγει μέχρι να το βρεις." },
    { art: <Art label="Προσθήκη">{tap}</Art>, title: "Πάτα «Προσθήκη»", text: "Πάνω δεξιά. Το εικονίδιο του Apex μπαίνει στην οθόνη σου." },
    { art: <Art label="Apex">{tap}</Art>, title: "Άνοιγε το Apex από το εικονίδιο", text: "Από εδώ και πέρα ανοίγει σαν κανονική εφαρμογή, πάντα στην πιο πρόσφατη έκδοση." },
    { art: <Art>{bell}</Art>, title: "Άνοιξε τις ειδοποιήσεις", text: "Μέσα στο Apex: «Λογαριασμός» → «Ειδοποιήσεις». Έτσι σου θυμίζουμε την ομάδα και την ατομική σου." },
  ],
  android: [
    { art: <Art label="Chrome">{globe}</Art>, title: "Άνοιξε το Apex στο Chrome", text: "Πάτα τη διεύθυνση που σου στείλαμε· αν ανοίξει αλλού, διάλεξε «Άνοιγμα στο Chrome»." },
    { art: <Art>{kebab}</Art>, title: "Πάτα τις τρεις τελείες", text: "Πάνω δεξιά στην οθόνη." },
    { art: <Art>{install}</Art>, title: "«Εγκατάσταση εφαρμογής»", text: "Σε κάποια κινητά λέγεται «Προσθήκη στην αρχική οθόνη»." },
    { art: <Art label="Εγκατάσταση">{tap}</Art>, title: "Επιβεβαίωσε", text: "Πάτα «Εγκατάσταση» ή «Προσθήκη». Το εικονίδιο του Apex μπαίνει στην οθόνη σου." },
    { art: <Art label="Apex">{tap}</Art>, title: "Άνοιγε το Apex από το εικονίδιο", text: "Από εδώ και πέρα ανοίγει σαν κανονική εφαρμογή, πάντα στην πιο πρόσφατη έκδοση." },
    { art: <Art>{bell}</Art>, title: "Άνοιξε τις ειδοποιήσεις", text: "Μέσα στο Apex: «Λογαριασμός» → «Ειδοποιήσεις». Έτσι σου θυμίζουμε την ομάδα και την ατομική σου." },
  ],
};

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallGuide() {
  const [os, setOs] = useState<Os>("ios");
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<BIP | null>(null);
  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setOs("android");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as { standalone?: boolean }).standalone));
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BIP); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return <div className="notice">Το Apex είναι ήδη στο κινητό σου ✓ Μένει μόνο να ανοίξεις τις ειδοποιήσεις στον «Λογαριασμό».</div>;
  return (
    <div className="install-guide">
      <div className="ig-tabs" role="tablist" aria-label="Κινητό">
        {(["ios", "android"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={os === k} className={os === k ? "on" : undefined} onClick={() => setOs(k)}>
            {k === "ios" ? "iPhone" : "Android"}
          </button>
        ))}
      </div>
      {os === "android" && prompt && (
        <button type="button" className="primary big ig-quick" onClick={async () => { await prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === "accepted") setInstalled(true); setPrompt(null); }}>
          Βάλ' το με ένα πάτημα
        </button>
      )}
      <ol className="ig-steps">
        {STEPS[os].map((s, i) => (
          <li key={s.title}>
            <span className="ig-num">{i + 1}</span>
            {s.art}
            <span className="ig-body"><strong>{s.title}</strong><span>{s.text}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Μικρή κάρτα στο «Σήμερα» του μέλους: μόνο σε κινητό, μόνο αν δεν το έχει ήδη εγκαταστήσει, κλείνει με «Όχι τώρα». */
export function InstallNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as { standalone?: boolean }).standalone);
    let dismissed = false;
    try { dismissed = localStorage.getItem("apex-install-nudge") === "no"; } catch {}
    setShow(mobile && !standalone && !dismissed);
  }, []);
  if (!show) return null;
  return (
    <div className="panel ig-nudge">
      <span className="grow"><strong>Βάλε το Apex στο κινητό σου</strong><span className="hint">Σαν εφαρμογή, με υπενθυμίσεις για την ομάδα και την ατομική σου.</span></span>
      <a className="btn primary" href="/install">Δείξε μου πώς</a>
      <button type="button" className="ig-later" onClick={() => { try { localStorage.setItem("apex-install-nudge", "no"); } catch {} setShow(false); }}>Όχι τώρα</button>
    </div>
  );
}
