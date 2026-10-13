"use client";

import { Icon } from "./Icon";

// «Σύνδεση»: καταγράφει την είσοδο, ανοίγει το Zoom σε νέα καρτέλα/εφαρμογή
// και φέρνει τη σελίδα της συνεδρίας μέσα στο app.
export function JoinButton({ kind, refId, roomUrl, next, label = "Σύνδεση", className = "primary", icon }: { kind: "SLOT" | "GROUP"; refId: string; roomUrl: string; next: string; label?: string; className?: string; icon?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const data = JSON.stringify({ kind, ref: refId });
        if (!navigator.sendBeacon?.("/api/join", new Blob([data], { type: "application/json" }))) {
          void fetch("/api/join", { method: "POST", body: data, headers: { "content-type": "application/json" }, keepalive: true });
        }
        if (roomUrl) window.open(roomUrl, "_blank", "noopener");
        window.location.href = next;
      }}
    >
      {icon && <Icon name={icon} size={20} />}
      {label}
    </button>
  );
}
