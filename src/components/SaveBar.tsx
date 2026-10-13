"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * Σταθερή μπάρα αποθήκευσης των σημειωματαρίων (13/10): λέει πάντα με λέξεις αν υπάρχουν μη αποθηκευμένες αλλαγές,
 * αν αποθηκεύεται, αν απέτυχε. «Αποθηκευμένο» μόνο όταν υπάρχει πραγματικά αποθηκευμένη μορφή.
 */
export function SaveBar({ dirty, problem, savedAt, label = "Αποθήκευση σημειώματος", onConcern }: { dirty: boolean; problem: string; savedAt?: string; label?: string; onConcern?: () => void }) {
  const { pending } = useFormStatus();
  const state = pending ? "saving" : problem ? "error" : dirty ? "dirty" : savedAt ? "saved" : "";
  const text = pending ? "Αποθήκευση…" : problem ? "Δεν αποθηκεύτηκε" : dirty ? "Μη αποθηκευμένες αλλαγές" : savedAt ? `Αποθηκευμένο · ${savedAt}` : "Τίποτα δεν έχει γραφτεί ακόμα";
  return (
    <div className="savebar">
      <span className={`save-status ${state}`} aria-live="polite"><i />{text}</span>
      <span className="row" style={{ gap: 8 }}>
        {onConcern && <button type="button" className="btn" onClick={onConcern}><Icon name="alert" size={16} /> Ανησυχία για την ασφάλεια</button>}
        <button className="primary" type="submit" disabled={pending}><Icon name="save" size={16} /> {pending ? "Αποθήκευση…" : label}</button>
      </span>
    </div>
  );
}
