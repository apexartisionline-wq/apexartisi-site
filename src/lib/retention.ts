/**
 * Χρόνοι τήρησης (Πολιτική διατήρησης και ασφαλούς καταστροφής — έγγραφο 13 του φακέλου συμμόρφωσης, 9/10/2026·
 * Διευκρινιστικό έγγραφο, ενότητα Γ: «υλοποιούνται τεχνικά … καμία κατηγορία δεν τηρείται επ' αόριστον»).
 * Βλ. docs/legal/2026-10-13-fakelos-symmorfosis-kai-efarmogi.md.
 *
 * Καθαρή λογική (χωρίς βάση): οι χρόνοι, η ημερομηνία λήξης συνεργασίας και πότε λήγει κάθε κατηγορία.
 * Οι χρόνοι είναι εδώ, σε ένα σημείο· αν ο Υπεύθυνος Προστασίας Δεδομένων αλλάξει κάποιον, αλλάζει μία τιμή.
 */

export type RetentionKey = "clinical" | "risk" | "registry" | "unheld" | "logs";

export type RetentionRule = {
  key: RetentionKey;
  label: string; // με λέξεις, για τη σελίδα της διαχείρισης
  months: number;
  from: string; // σημείο έναρξης, με λέξεις
  covers: string; // τι περιλαμβάνει στην εφαρμογή
  action: string; // ενέργεια λήξης
};

export const RETENTION: Record<RetentionKey, RetentionRule> = {
  clinical: {
    key: "clinical",
    label: "Κλινικός φάκελος και ημερολόγιο ανάκαμψης",
    months: 12,
    from: "λήξη συνεργασίας",
    covers:
      "Σημειώματα ατομικής και Therapair με όλες τις προηγούμενες εκδόσεις, ημερολόγιο (απογραφές), στόχοι, βήματα και εργασίες, πλάνο, αρχική αξιολόγηση και στοιχεία ταυτότητας/επαφής έκτακτης ανάγκης, ανάγκες ασφάλειας, σύνοψη περίπτωσης, ανασκοπήσεις κύκλου, μηνύματα μήνα, ηχογραφημένο μήνυμα, νηφαλιότητα, παρουσίες σε ομάδες, «Προσοχή σε…», ενέργειες, ιστορικό αλλαγών. Το κείμενο της ολοκλήρωσης σβήνεται· μένει μόνο η ημερομηνία και ο τρόπος λήξης.",
    action: "Οριστική διαγραφή (και των εκδόσεων)",
  },
  risk: {
    key: "risk",
    label: "Τεκμηρίωση ενεργοποίησης ειδοποίησης κινδύνου",
    months: 60,
    from: "περιστατικό",
    covers:
      "Κόκκινο κουμπί (με το τι έγινε), γραμμές ενημέρωσης ομάδας, συμβάντα, τηλεφωνήματα της διαχείρισης για ανάγκες ασφάλειας, άνοιγμα στοιχείων «Έκτακτης ανάγκης».",
    action: "Διαγραφή",
  },
  registry: {
    key: "registry",
    label: "Μητρώο μελών, κρατήσεις και συγκαταθέσεις",
    months: 60,
    from: "λήξη συνεργασίας",
    covers: "Λογαριασμός μέλους (όνομα, τηλέφωνο, κωδικός μέλους), κύκλοι, κρατήσεις, έγγραφα έναρξης και συγκαταθέσεις, ημερομηνία ολοκλήρωσης.",
    action: "Διαγραφή· ο λογαριασμός ανωνυμοποιείται (αφαιρείται κάθε αναγνωριστικό)",
  },
  unheld: {
    key: "unheld",
    label: "Ραντεβού που δεν πραγματοποιήθηκαν",
    months: 6,
    from: "ημερομηνία ραντεβού",
    covers: "Ακυρώσεις (και λόγω αργίας) που κρατήθηκαν στο ιστορικό· αιτήματα αλλαγής ή ακύρωσης που έκλεισαν.",
    action: "Διαγραφή",
  },
  logs: {
    key: "logs",
    label: "Αρχεία καταγραφής",
    months: 6,
    from: "δημιουργία",
    covers: "Καταγραφή πρόσβασης (εκτός από το άνοιγμα της «Έκτακτης ανάγκης», που ακολουθεί την τεκμηρίωση κινδύνου), πάτημα «Μπες» θεραπευτή, ειδοποιήσεις.",
    action: "Αυτόματη διαγραφή",
  },
};

/** Ενέργειες της καταγραφής πρόσβασης που είναι τεκμηρίωση κινδύνου (5 έτη), όχι απλό αρχείο καταγραφής (6 μήνες). */
export const RISK_ACCESS_ACTIONS = ["emergency_reveal", "emergency_view"];

/** + μήνες σε ημερομηνία (ημερολογιακά· 31/1 + 1 μήνας = 28 ή 29/2). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/** Πότε λήγει μια κατηγορία, από το σημείο έναρξής της. */
export const expiresAt = (key: RetentionKey, start: Date): Date => addMonths(start, RETENTION[key].months);

/** Το όριο: ό,τι ξεκίνησε πριν από αυτό έχει λήξει. */
export const cutoff = (key: RetentionKey, now: Date): Date => addMonths(now, -RETENTION[key].months);

/**
 * Λήξη συνεργασίας: η τελευταία «Ολοκλήρωση συνεργασίας», εφόσον δεν άρχισε νέος κύκλος μετά από αυτήν
 * (επανασύνδεση). Χωρίς ολοκλήρωση δεν υπάρχει λήξη — η εφαρμογή δεν τη μαντεύει (π.χ. από απενεργοποίηση).
 */
export function collaborationEnd(closures: { createdAt: Date }[], cycles: { startedAt: Date }[]): Date | null {
  if (closures.length === 0) return null;
  const last = closures.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)).createdAt;
  if (cycles.some((c) => c.startedAt > last)) return null;
  return last;
}

/** Τι λήγει για ένα μέλος σε μια στιγμή (κατηγορίες που ξεκινούν από τη λήξη συνεργασίας). */
export function memberDue(end: Date | null, now: Date, held: boolean) {
  if (!end || held) return { clinical: false, registry: false };
  return { clinical: expiresAt("clinical", end) <= now, registry: expiresAt("registry", end) <= now };
}
