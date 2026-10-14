"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * Σταθερή μπάρα των σημειωματαρίων (13/10, ανανεώθηκε 14/10 κατά το προσχέδιο): αριστερά «Πίσω», στη μέση με λέξεις
 * αν υπάρχουν μη αποθηκευμένες αλλαγές / αν αποθηκεύεται / αν απέτυχε, δεξιά «Συνέχεια →» (ή «Αποθήκευση» στο τελευταίο
 * βήμα). «Αποθηκευμένο» μόνο όταν υπάρχει πραγματικά αποθηκευμένη μορφή. Σε ενδιάμεσο βήμα η αποθήκευση μένει
 * διαθέσιμη (διακριτικά), για να μη χάνεται σημείωμα αν διακοπεί η συνεδρία.
 * Στο κινητό (≤760px) «Πίσω» και «Αποθήκευση τώρα» γίνονται εικονίδια (με aria-label/title) ώστε η μπάρα να μένει
 * σε μία γραμμή (~54px) και να μην καλύπτει τη φόρμα.
 */
export function SaveBar({ dirty, problem, savedAt, label = "Αποθήκευση σημειώματος", nav }: {
  dirty: boolean; problem: string; savedAt?: string; label?: string;
  nav?: { back?: () => void; next?: () => void; nextLabel?: string; last: boolean };
}) {
  const { pending } = useFormStatus();
  const state = pending ? "saving" : problem ? "error" : dirty ? "dirty" : savedAt ? "saved" : "";
  const text = pending ? "Αποθήκευση…" : problem ? "Δεν αποθηκεύτηκε" : dirty ? "Μη αποθηκευμένες αλλαγές" : savedAt ? `Αποθηκευμένο · ${savedAt}` : "Τίποτα δεν έχει γραφτεί ακόμα";
  // Ίδιο νόημα, λιγότερες λέξεις, για τη μία γραμμή του κινητού.
  const short = pending ? "Αποθήκευση…" : problem ? "Δεν αποθηκεύτηκε" : dirty ? "Μη αποθηκευμένο" : savedAt ? `Αποθηκευμένο ${savedAt}` : "Τίποτα ακόμα";
  const last = !nav || nav.last;
  return (
    <div className="savebar">
      <span className="savebar-left">
        {nav?.back ? <button type="button" className="btn sm icon-sm" onClick={nav.back} aria-label="Πίσω" title="Πίσω στο προηγούμενο βήμα"><Icon name="back" size={16} /><span className="hide-sm"> Πίσω</span></button> : <span />}
      </span>
      <span className="savebar-mid">
        <span className={`save-status ${state}`} aria-live="polite" title={`${text}. Η αποθήκευση κρατά το ιστορικό αλλαγών.`}><i /><span className="save-text hide-sm">{text}</span><span className="save-text only-sm">{short}</span></span>
      </span>
      <span className="row savebar-actions" style={{ gap: 8 }}>
        {!last && <button className="btn quiet sm icon-sm" type="submit" disabled={pending} aria-label="Αποθήκευση τώρα" title="Αποθηκεύει ό,τι έχεις γράψει ως εδώ"><Icon name="save" size={16} /><span className="hide-sm"> {pending ? "Αποθήκευση…" : "Αποθήκευση τώρα"}</span></button>}
        {!last && nav?.next && <button type="button" className="primary sm" onClick={nav.next} aria-label={nav.nextLabel ?? "Συνέχεια"} title={nav.nextLabel}>Συνέχεια <Icon name="chevron" size={16} /></button>}
        {last && <button className="primary sm" type="submit" disabled={pending}><Icon name="save" size={16} /> {pending ? "Αποθήκευση…" : label}</button>}
      </span>
    </div>
  );
}
