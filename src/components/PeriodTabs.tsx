"use client";

import { useId, useState } from "react";

/**
 * Επιλογέας «Εβδομάδα / Μήνας» (απόφαση 14/10) για τις οθόνες της ατομικής: και οι δύο εικόνες έρχονται έτοιμες
 * από τον server, εδώ απλώς εναλλάσσονται — χωρίς νέα φόρτωση, ώστε να μη χαθεί σημείωμα που γράφεται.
 */
export function PeriodTabs({ week, month, weekLabel, monthLabel, initial = "week" }: { week: React.ReactNode; month: React.ReactNode; weekLabel: string; monthLabel: string; initial?: "week" | "month" }) {
  const [kind, setKind] = useState<"week" | "month">(initial);
  const id = useId();
  const tab = (k: "week" | "month", label: string) => (
    <button type="button" role="tab" id={`${id}-${k}`} aria-selected={kind === k} aria-controls={`${id}-${k}-panel`} className={`ptab${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
      {label}
    </button>
  );
  return (
    <div className="period">
      <div className="ptabs" role="tablist" aria-label="Περίοδος">
        {tab("week", "Εβδομάδα")}
        {tab("month", "Μήνας")}
        <span className="ptab-when">{kind === "week" ? weekLabel : monthLabel}</span>
      </div>
      <div role="tabpanel" id={`${id}-week-panel`} aria-labelledby={`${id}-week`} hidden={kind !== "week"}>{week}</div>
      <div role="tabpanel" id={`${id}-month-panel`} aria-labelledby={`${id}-month`} hidden={kind !== "month"}>{month}</div>
    </div>
  );
}
