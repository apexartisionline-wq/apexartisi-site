"use client";

import { useRef } from "react";

/**
 * Τέσσερα βήματα σημειώματος (14/10, κατεύθυνση από το προσχέδιο της υπεύθυνης): αριθμημένοι κύκλοι με γραμμή,
 * ✓ όταν το βήμα έχει συμπληρωθεί, το ενεργό τονισμένο, και από κάτω «Βήμα Χ από 4 · Υ απομένουν».
 * Είναι role=tablist: ανοίγει όποιο βήμα θέλεις (όχι υποχρεωτικά με τη σειρά) και με τα βελάκια του πληκτρολογίου.
 */
export function FormSteps({ steps, active, done, onChange, label, idPrefix }: { steps: readonly string[]; active: number; done: boolean[]; onChange: (i: number) => void; label: string; idPrefix: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const left = done.filter((x) => !x).length;
  const go = (i: number) => {
    const n = Math.max(0, Math.min(steps.length - 1, i));
    onChange(n);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[n]?.focus();
  };
  return (
    <>
      <div
        className="steps"
        role="tablist"
        aria-label={label}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
          if (e.key === "Home") { e.preventDefault(); go(0); }
          if (e.key === "End") { e.preventDefault(); go(steps.length - 1); }
        }}
      >
        {steps.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            className={done[i] ? "done" : undefined}
            aria-selected={active === i}
            aria-controls={`${idPrefix}-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => onChange(i)}
            aria-label={`Βήμα ${i + 1}: ${t}${done[i] ? " (συμπληρωμένο)" : ""}`}
          >
            <span className="step-dot" aria-hidden="true">{done[i] && active !== i ? "✓" : i + 1}</span>
            <span className="step-label">{t}</span>
          </button>
        ))}
      </div>
      <p className="steps-status" aria-live="polite">
        Βήμα {active + 1} από {steps.length} · {left === 0 ? "όλα τα βήματα έχουν κάτι γραμμένο" : `${left} ${left === 1 ? "απομένει" : "απομένουν"}`}
      </p>
    </>
  );
}
