"use client";

import { createContext, useContext, useState } from "react";
import { FormSteps } from "./FormSteps";

/**
 * Τα 4 βήματα σε ΟΛΟ το πλάτος, πάνω από το σημειωματάριο (14/10). Από 16/10 χωρίς δεξιά στήλη: η ασφάλεια («Πριν
 * ξεκινήσεις») και η «Συνέχεια φροντίδας» μπαίνουν ΠΑΝΩ από αυτό το πλαίσιο, σε όλο το πλάτος, και το σημειωματάριο πιάνει
 * όλο το πλάτος. Το βήμα και ποια βήματα έχουν συμπληρωθεί τα κρατά αυτό το πλαίσιο· τα πεδία μένουν στη φόρμα
 * (NoteFormClient). «Στο σημειωματάριο ↓» της κεφαλίδας έρχεται εδώ (#notebook-top).
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
      <div id="notebook-top" className={`cols note-grid${enabled ? " has-steps" : ""}`}>
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
