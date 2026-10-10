"use client";

import { useEffect, useState } from "react";

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Ενεργοποίηση ειδοποιήσεων σε αυτή τη συσκευή.
export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "off" | "on" | "denied" | "error">("loading");

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("error"));
  }, []);

  async function enable() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) as BufferSource });
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) });
      setState("on");
    } catch {
      setState("error");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (!vapidKey) return <p className="muted small">Οι ειδοποιήσεις δεν έχουν ρυθμιστεί ακόμα στον server.</p>;
  if (state === "loading") return <p className="muted small">…</p>;
  if (state === "ios-install")
    return (
      <div className="notice small">
        Στο iPhone οι ειδοποιήσεις δουλεύουν μόνο αν προσθέσεις το Apex στην αρχική οθόνη: πάτα το κουμπί
        «Κοινοποίηση» (τετράγωνο με βέλος) → «Προσθήκη στην οθόνη Αφετηρίας», άνοιξε το Apex από εκεί και έλα ξανά εδώ.
      </div>
    );
  if (state === "unsupported") return <p className="muted small">Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις.</p>;
  if (state === "denied") return <p className="small">Οι ειδοποιήσεις είναι μπλοκαρισμένες. Άνοιξέ τις από τις ρυθμίσεις του κινητού για το Apex.</p>;
  if (state === "error") return <p className="small">Κάτι δεν πήγε καλά. Δοκίμασε ξανά.</p>;
  return state === "on" ? (
    <div className="row spread"><span>Ενεργές σε αυτή τη συσκευή ✓</span><button onClick={disable}>Απενεργοποίηση</button></div>
  ) : (
    <button className="primary" onClick={enable}>Ενεργοποίησε τις ειδοποιήσεις</button>
  );
}
