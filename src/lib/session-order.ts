/**
 * Αρίθμηση ατομικών και βήμα πρωτοκόλλου (υπεύθυνη 17/10: «στο πρόγραμμα του θεραπευτή με το κάθε μέλος να φαίνεται
 * αριθμημένη ποια συνεδρία είναι, να έχει μπροστά τον αριθμό 1 και δίπλα «λήψη ιστορικού»· η 2η ατομική είναι το
 * πλάνο υποστήριξης του μέλους και γίνεται από όλους»).
 *
 * Καθαρή λογική, χωρίς βάση (η φόρτωση στο session-order-db.ts).
 *
 * Κανόνας αρίθμησης: «Νη ατομική» = όσες ατομικές ΜΕ ΠΑΡΟΥΣΙΑ προηγήθηκαν από την έναρξη του προγράμματος + 1.
 * - Μετρούν μόνο ατομικές (όχι Therapair, όχι ομάδες).
 * - Παρουσία = ίδιος κανόνας με το presence.ts: η επιβεβαίωση του σημειώματος («Ήρθε»/«Δεν ήρθε») υπερισχύει·
 *   χωρίς επιβεβαίωση μετρά το πάτημα «Μπες» του μέλους.
 * - «Δεν ήρθε» ή «χωρίς καταγραφή» δεν προχωρούν τον αριθμό: αν στην 1η ατομική το μέλος δεν ήρθε, η επόμενη είναι
 *   πάλι «1η ατομική · λήψη ιστορικού».
 * - Η αρίθμηση δεν μηδενίζει ανά κύκλο (το «ατομική Χ από 8 του μήνα» είναι άλλο μέτρο και μένει).
 *
 * Βήμα πρωτοκόλλου (τι γίνεται σε αυτή την ατομική): βγαίνει από το ΤΙ ΕΧΕΙ ΓΙΝΕΙ, όχι μόνο από τον αριθμό, ώστε αν
 * κάτι δεν έγινε στην ώρα του να μη χάνεται: χωρίς ολοκληρωμένο ιστορικό → «λήψη ιστορικού»· με ιστορικό αλλά χωρίς
 * ΠΛΗΡΕΣ πλάνο υποστήριξης (και οι 7 ερωτήσεις) → «πλάνο υποστήριξης»· αλλιώς μόνο ο αριθμός. Τα επόμενα βήματα (3η, 4η) δεν έχουν αποφασιστεί.
 */

export type PriorSession = { confirmedCame: boolean | null; joinedAt: Date | string | null };

/** Μετρά ως παρουσία (ίδιος κανόνας με presence.ts, χωρίς τις χρονικές καταστάσεις). */
export function countsAsCame(b: PriorSession): boolean {
  if (b.confirmedCame !== null && b.confirmedCame !== undefined) return b.confirmedCame;
  return Boolean(b.joinedAt);
}

/** Ο αριθμός της ατομικής: όσες προηγούμενες με παρουσία + 1. */
export function sessionOrdinal(prior: PriorSession[]): number {
  return prior.filter(countsAsCame).length + 1;
}

export type ProtocolStepKey = "history" | "plan";
export const PROTOCOL_STEP_LABEL: Record<ProtocolStepKey, string> = {
  history: "λήψη ιστορικού",
  plan: "πλάνο υποστήριξης",
};

/** Το βήμα του πρωτοκόλλου που αναλογεί σε αυτή την ατομική, από το τι έχει ήδη γίνει. */
export function protocolStep(i: { assessed: boolean; planWritten: boolean }): ProtocolStepKey | null {
  if (!i.assessed) return "history";
  if (!i.planWritten) return "plan";
  return null;
}

/** «2η ατομική» */
export function ordinalLabel(n: number): string {
  return `${n}η ατομική`;
}

/** «2η ατομική · πλάνο υποστήριξης» (ή μόνο «5η ατομική»). */
export function sessionLabel(n: number, step: ProtocolStepKey | null): string {
  return step ? `${ordinalLabel(n)} · ${PROTOCOL_STEP_LABEL[step]}` : ordinalLabel(n);
}
