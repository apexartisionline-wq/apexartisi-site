// Πώς στέλνεται ένα βήμα και πώς το απαντά το μέλος (υπεύθυνη 16/10: «να έχει 3 επιλογές· ή να στέλνουμε pdf και να τα
// γράφει σε τετράδιο, ή σε pdf και να απαντάει σε αυτό, ή σε φόρμα»). Οι κανόνες σε ένα σημείο.

export const STEP_MODES = {
  FORM: { admin: "Φόρμα μέσα στο Apex", hint: "Γράφεις τις ερωτήσεις εδώ· το μέλος απαντά μέσα στο Apex (ή ανεβάζει φωτογραφία).", member: "Γράψε εδώ" },
  PDF_NOTEBOOK: { admin: "PDF · το γράφει στο τετράδιό του", hint: "Ανεβάζεις PDF· το μέλος το διαβάζει και γράφει στο τετράδιό του, και σημειώνει «Το έγραψα».", member: "Γράψ' το στο τετράδιό σου" },
  PDF_FILL: { admin: "PDF · το συμπληρώνει και το ανεβάζει", hint: "Ανεβάζεις PDF· το μέλος το συμπληρώνει και το ανεβάζει πίσω.", member: "Συμπλήρωσέ το και ανέβασέ το" },
} as const;
export type StepMode = keyof typeof STEP_MODES;
export const isStepMode = (x: unknown): x is StepMode => typeof x === "string" && x in STEP_MODES;
export const needsPdf = (m: StepMode) => m !== "FORM";

/** Όριο αρχείου: οι functions του Netlify δέχονται έως ~6 MB ανά αίτημα. */
export const STEP_PDF_MAX = 5 * 1024 * 1024;

/** Είναι πράγματι PDF; (τύπος + τα πρώτα bytes «%PDF») */
export function looksLikePdf(type: string, head: Uint8Array): boolean {
  return type === "application/pdf" && head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

/** Κατάσταση με λέξεις, ίδια για μέλος, θεραπευτές και διαχείριση. */
export function stepStatus(a: { mode: string; answeredAt: Date | null; notebookAt: Date | null; answerPdfAt: Date | null }): string {
  if (a.mode === "PDF_NOTEBOOK") return a.notebookAt ? "Το έγραψε στο τετράδιο" : a.answeredAt ? "Έστειλε φωτογραφία" : "Δεν το έγραψε ακόμα";
  if (a.mode === "PDF_FILL") return a.answerPdfAt ? "Ανέβασε το συμπληρωμένο PDF" : a.answeredAt ? "Έστειλε φωτογραφία" : "Δεν το ανέβασε ακόμα";
  return a.answeredAt ? "Το έγραψε" : "Δεν το έγραψε ακόμα";
}

/** Όνομα αρχείου χωρίς επικίνδυνους χαρακτήρες (για Content-Disposition). */
export function safeFileName(name: string, fallback: string): string {
  const n = name.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return n ? (n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`) : fallback;
}
