"use client";

import { createContext, useContext, useState } from "react";
import { FormSteps } from "./FormSteps";

/**
 * Η οθόνη της ατομικής κατά το προσχέδιο της υπεύθυνης (14/10): τα 4 βήματα σε ΟΛΟ το πλάτος, πάνω από το σημειωματάριο
 * (αριστερά) και το «Πριν συνεχίσεις» (δεξιά). Το βήμα και ποια βήματα έχουν συμπληρωθεί τα κρατά αυτό το πλαίσιο· τα πεδία
 * μένουν στη φόρμα (NoteFormClient). Το πλαϊνό μένει ΕΞΩ από τη φόρμα (έχει δικές του φόρμες, π.χ. «Το αναλαμβάνω»).
 * Στο κινητό: πρώτα το πλαϊνό (η ασφάλεια διαβάζεται πρώτη), μετά τα βήματα, μετά το σημειωματάριο.
 */
type Ctx = { steps: readonly string[]; tab: number; setTab: (n: number) => void; done: boolean[]; setDone: (d: boolean[]) => void };
const StepCtx = createContext<Ctx | null>(null);
export const useSteps = () => useContext(StepCtx);

export function NoteWorkspace({ steps, enabled, children }: { steps: readonly string[]; enabled: boolean; children: React.ReactNode }) {
  const [tab, setTab] = useState(0);
  const [done, setDoneState] = useState<boolean[]>(() => steps.map(() => false));
  const setDone = (d: boolean[]) => setDoneState((cur) => (cur.length === d.length && cur.every((x, i) => x === d[i]) ? cur : d));
  return (
    <StepCtx.Provider value={enabled ? { steps, tab, setTab, done, setDone } : null}>
      <div className={`cols note-grid${enabled ? " has-steps" : ""}`}>
        {enabled && (
          <div className="ws-steps">
            <FormSteps steps={steps} active={tab} done={done} onChange={setTab} label="Βήματα σημειώματος" idPrefix="note-tab" />
          </div>
        )}
        {children}
      </div>
    </StepCtx.Provider>
  );
}
