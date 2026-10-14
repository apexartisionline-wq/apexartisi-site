/**
 * Τι βλέπει ο θεραπευτής (απόφαση υπεύθυνης 13/10: «οι θεραπευτές να βλέπουν μόνο σημειώματα με υδατογράφημα»).
 * Κανόνες σε ένα σημείο· ελέγχονται στον server σε κάθε σελίδα. Η διαχείριση βλέπει ό,τι έβλεπε.
 *
 *  - Σημειώματα (ατομικής, Therapair, ομάδας): τα διαβάζουν όλοι οι θεραπευτές, με υδατογράφημα (όνομα + ώρα)
 *    και χωρίς αντιγραφή/εκτύπωση. Το δικό τους σημείωμα το γράφουν κανονικά.
 *  - Αρχική αξιολόγηση, αξιολόγηση αναγκών ασφάλειας (απαντήσεις, αιτιολόγηση) και «Έκτακτη ανάγκη»: μόνο ψυχολόγος.
 *    Οι υπόλοιποι βλέπουν μόνο μία γραμμή (επίπεδο, σοβαρό σημείο, αφορμή), χωρίς λεπτομέρειες.
 *  - Ημερολόγιο ανάκαμψης: ο θεραπευτής βλέπει μόνο αριθμούς (μέρες που έγραψε, μέσοι όροι, πόσες μέρες) — όχι
 *    απαντήσεις μέρα-μέρα και όχι κείμενα (σημείωση, νίκες). Αλλάζει την απόφαση 4/10. Η χρήση και οι σκέψεις
 *    να κάνει κακό στον εαυτό του μένουν σήματα, μία γραμμή, χωρίς το κείμενο.
 *  - Φάκελος «Μήνας» (σελίδα μήνα με όλα τα σημειώματα και λήψη PDF): μόνο η διαχείριση.
 *  - Μένουν όπως ήταν: πλάνο υποστήριξης, σύνοψη περίπτωσης, ανασκόπηση κύκλου, στόχος εβδομάδας, βήματα/εργασίες,
 *    παρουσίες/Συνέπεια, σημειώματα ομάδας.
 */
import { localParts } from "./time";

export type Viewer = { role: string; therapistKind: string | null };

/** Λέξη για τον τύπο θεραπευτή, όπου χρειάζεται να ξέρει ο επόμενος ποιος είχε την προηγούμενη ατομική (εναλλαγή). */
export const KIND_WORD: Record<string, string> = { CLINICAL: "ψυχολόγος", BIOMATIC: "βιωματικός", BOTH: "ψυχολόγος και βιωματικός" };
export const kindWord = (k: string | null | undefined): string => (k ? KIND_WORD[k] ?? "" : "");
/** «Όνομα (ψυχολόγος)» — χωρίς διπλή ετικέτα αν το όνομα την περιέχει ήδη (π.χ. ψεύτικοι λογαριασμοί «Άννα Κ. (ψυχολόγος)»). */
export const nameWithKind = (name: string, k: string | null | undefined): string => { const w = kindWord(k); return w && !name.includes(w.split(" ")[0]) ? `${name} (${w})` : name; };

/** Ψυχολόγος (κλινικός ή «και τα δύο») ή διαχείριση. Ίδιος κανόνας με την εγγραφή (canWriteRisk/canWriteAssessment). */
export const isPsychologist = (u: Viewer): boolean => u.role === "ADMIN" || u.therapistKind === "CLINICAL" || u.therapistKind === "BOTH";

/**
 * Αυξημένες ή Υψηλές ανάγκες ασφάλειας: «τα βλέπουν όλοι όλα» (απόφαση 14/10) — κάθε θεραπευτής του μέλους βλέπει τις
 * απαντήσεις και την αιτιολόγηση των αξιολογήσεων αναγκών και την αρχική αξιολόγηση (ανάγνωση, με υδατογράφημα).
 * Σε Συνήθεις (ή χωρίς αξιολόγηση) μένει ο κανόνας του ψυχολόγου. Η εγγραφή μένει στον ψυχολόγο.
 */
export const seesSafetyDetail = (u: Viewer, level: string | null | undefined): boolean => isPsychologist(u) || level === "MEDIUM" || level === "HIGH";

/** Απαντήσεις και κείμενα του ημερολογίου, μέρα-μέρα: μόνο η διαχείριση. */
export const seesJournalDetail = (u: Viewer): boolean => u.role === "ADMIN";

/** Φάκελος «Μήνας» (με λήψη PDF): μόνο η διαχείριση. */
export const seesMonthFolder = (u: Viewer): boolean => u.role === "ADMIN";

/** Τα σημειώματα φαίνονται με υδατογράφημα και χωρίς αντιγραφή σε όποιον δεν είναι διαχείριση. */
export const watermarksNotes = (u: Viewer): boolean => u.role !== "ADMIN";

/** Το υδατογράφημα: εικόνα SVG σε επανάληψη, με όνομα και ώρα προβολής (ώστε κάθε φωτογραφία οθόνης να δείχνει ποιος και πότε). */
export function watermarkCss(name: string, when: string, dark = false): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const text = `${esc(name)} · ${esc(when)} · Εμπιστευτικό`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="170">` +
    `<text x="180" y="95" text-anchor="middle" transform="rotate(-22 180 85)" font-family="Manrope, Arial, sans-serif" font-size="13" font-weight="600" fill="${dark ? "#FFFFFF" : "#0C1620"}" fill-opacity="${dark ? "0.08" : "0.09"}">${text}</text>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Ώρα προβολής για το υδατογράφημα, ώρα Ελλάδας: «13/10/2026 21:40». */
export function watermarkWhen(d: Date): string {
  const p = localParts(d);
  const [y, m, day] = p.date.split("-");
  return `${Number(day)}/${Number(m)}/${y} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
