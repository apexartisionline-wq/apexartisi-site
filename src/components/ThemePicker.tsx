"use client";

import { useRef } from "react";

// Θέμα που αλλάζει με το πάτημα (υπεύθυνη 25/10: «μόλις το πατάει να το βλέπει, να μη χρειάζεται να πατάει αποθήκευση»):
// αλλάζει αμέσως η σελίδα και η επιλογή αποθηκεύεται μόνη της στον λογαριασμό.
export function ThemePicker({ themes, current, action }: { themes: Record<string, string>; current: string; action: (fd: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="row" style={{ gap: 16, flexWrap: "wrap" }}>
      {Object.entries(themes).map(([k, label]) => (
        <label key={k} className="row" style={{ gap: 6 }}>
          <input
            type="radio" name="theme" value={k} defaultChecked={current === k} style={{ width: "auto" }}
            onChange={() => { document.documentElement.dataset.theme = k; form.current?.requestSubmit(); }}
          />{" "}
          {label}
        </label>
      ))}
    </form>
  );
}
