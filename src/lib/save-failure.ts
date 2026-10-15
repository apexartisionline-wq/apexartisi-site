// Αποτυχία αποθήκευσης σημειώματος στον browser (16/10, από τη δοκιμή της υπεύθυνης: «πάτησα αποθήκευση, με έβγαλε
// στο «Κάτι δεν φόρτωσε σωστά» και δεν αποθηκεύτηκε»). Η σελίδα του σημειώματος ΔΕΝ φεύγει πια: μένει ό,τι γράφτηκε,
// με μήνυμα για το τι έγινε. Η πιο συχνή αιτία: ανέβηκε νέα έκδοση όσο ήταν ανοιχτή η σελίδα — το Next αλλάζει τους
// κωδικούς των ενεργειών σε κάθε έκδοση και ο server δεν αναγνωρίζει τον παλιό («Server Action … was not found»).

/** Ανέβηκε νέα έκδοση όσο ήταν ανοιχτή η σελίδα: χρειάζεται επαναφόρτωση (το πρόχειρο κρατιέται). */
export function isStaleVersion(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /UnrecognizedActionError|Server Action .* was not found|older or newer deployment/i.test(m);
}

/** Τι λέει το σημειωματάριο όταν δεν αποθηκεύτηκε (μπαίνει μετά το «Δεν αποθηκεύτηκε:»). */
export function saveFailure(e: unknown): { stale: boolean; text: string } {
  if (isStaleVersion(e)) {
    return { stale: true, text: "ανέβηκε νέα έκδοση της εφαρμογής όσο έγραφες. Πάτα «Ξαναφόρτωσε» (το σημείωμα κρατιέται) και μετά ξανά «Αποθήκευση»." };
  }
  const digest = typeof e === "object" && e !== null && "digest" in e ? String((e as { digest?: unknown }).digest ?? "") : "";
  if (digest) return { stale: false, text: `ο server δεν μπόρεσε να το αποθηκεύσει (κωδικός ${digest}). Δοκίμασε ξανά «Αποθήκευση»· αν ξαναγίνει, ενημέρωσε την ομάδα υποστήριξης.` };
  return { stale: false, text: "δεν ήρθε απάντηση από τον server (ίσως η σύνδεση). Πάτα ξανά «Αποθήκευση»." };
}
