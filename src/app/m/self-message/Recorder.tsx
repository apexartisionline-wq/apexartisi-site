"use client";

import { useRef, useState } from "react";

export function Recorder({ hasExisting }: { hasExisting: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "recorded" | "saved" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const blob = useRef<Blob | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        blob.current = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob.current));
        setState("recorded");
      };
      r.start();
      rec.current = r;
      setState("recording");
    } catch {
      setState("error");
    }
  }

  async function save() {
    if (!blob.current) return;
    const res = await fetch("/api/self-message", {
      method: "POST",
      headers: { "content-type": blob.current.type },
      body: blob.current,
    });
    setState(res.ok ? "saved" : "error");
  }

  return (
    <div className="card stack">
      {hasExisting && state === "idle" && (
        <>
          <p className="muted">Το τωρινό σου μήνυμα:</p>
          <audio controls src="/api/self-message" style={{ width: "100%" }} />
        </>
      )}
      {state === "recording" ? (
        <button className="red big" onClick={() => rec.current?.stop()}>■ Σταμάτα</button>
      ) : (
        <button className="primary big" onClick={start}>● {hasExisting || url ? "Νέα ηχογράφηση" : "Ηχογράφηση"}</button>
      )}
      {url && state !== "recording" && (
        <>
          <audio controls src={url} style={{ width: "100%" }} />
          {state === "recorded" && <button className="primary" onClick={save}>Κράτα αυτό</button>}
        </>
      )}
      {state === "saved" && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {state === "error" && <div className="error">Κάτι δεν πήγε καλά. Έλεγξε ότι το κινητό επιτρέπει το μικρόφωνο.</div>}
    </div>
  );
}
