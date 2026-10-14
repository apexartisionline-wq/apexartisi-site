"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * Σταθερή μπάρα των σημειωματαρίων (13/10, ανανεώθηκε 14/10 κατά το προσχέδιο): αριστερά «Πίσω», στη μέση με λέξεις
 * αν υπάρχουν μη αποθηκευμένες αλλαγές / αν αποθηκεύεται / αν απέτυχε, δεξιά «Συνέχεια →» (ή «Αποθήκευση» στο τελευταίο
 * βήμα). «Αποθηκευμένο» μόνο όταν υπάρχει πραγματικά αποθηκευμένη μορφή. Σε ενδιάμεσο βήμα η αποθήκευση μένει
 * διαθέσιμη (διακριτικά), για να μη χάνεται σημείωμα αν διακοπεί η συνεδρία.
 */
export function SaveBar({ dirty, problem, savedAt, label = "Αποθήκευση σημειώματος", nav }: {
  dirty: boolean; problem: string; savedAt?: string; label?: string;
  nav?: { back?: () => void; next?: () => void; nextLabel?: string; last: boolean };
}) {
  const { pending } = useFormStatus();
  const state = pending ? "saving" : problem ? "error" : dirty ? "dirty" : savedAt ? "saved" : "";
  const text = pending ? "Αποθήκευση…" : problem ? "Δεν αποθηκεύτηκε" : dirty ? "Μη αποθηκευμένες αλλαγές" : savedAt ? `Αποθηκευμένο · ${savedAt}` : "Τίποτα δεν έχει γραφτεί ακόμα";
  const last = !nav || nav.last;
  return (
    <div className="savebar">
      <span className="savebar-left">
        {nav?.back ? <button type="button" className="btn" onClick={nav.back}><Icon name="back" size={16} /> Πίσω</button> : <span />}
      </span>
      <span className="savebar-mid">
        <span className={`save-status ${state}`} aria-live="polite"><i />{text}</span>
        <span className="savebar-hint hide-sm">Η αποθήκευση κρατά το ιστορικό αλλαγών.</span>
      </span>
      <span className="row savebar-actions" style={{ gap: 8 }}>
        {!last && <button className="btn quiet" type="submit" disabled={pending} title="Αποθηκεύει ό,τι έχεις γράψει ως εδώ">{pending ? "Αποθήκευση…" : "Αποθήκευση τώρα"}</button>}
        {!last && nav?.next && <button type="button" className="primary" onClick={nav.next} aria-label={nav.nextLabel ?? "Συνέχεια"}>{nav.nextLabel ?? "Συνέχεια"} <Icon name="chevron" size={16} /></button>}
        {last && <button className="primary" type="submit" disabled={pending}><Icon name="save" size={16} /> {pending ? "Αποθήκευση…" : label}</button>}
      </span>
    </div>
  );
}
