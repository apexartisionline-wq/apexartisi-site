/**
 * Επόμενες ενέργειες (13/10): για κάθε ενέργεια — τι χρειάζεται, ποιος την αναλαμβάνει, πότε δημιουργήθηκε,
 * προθεσμία (μόνο αν ορίστηκε από άνθρωπο ή υπάρχει ήδη στον κανόνα), κατάσταση, πότε και από ποιον ολοκληρώθηκε.
 *
 * Κανόνες:
 *  - «Το είδα» ≠ «Το ανέλαβα» ≠ «Ολοκληρώθηκε». Η ανάγνωση ειδοποίησης δεν ολοκληρώνει την ενέργεια.
 *  - Η λήξη των 24 ωρών μιας ειδοποίησης δεν κλείνει το θέμα· η ενέργεια μένει ανοιχτή.
 *  - Η διαχείριση συντονίζει· η θεραπευτική ευθύνη παραμένει συλλογική. Η ανάθεση αφορά μια συγκεκριμένη ενέργεια.
 *  - Καμία αυτόματη κλινική προθεσμία ή κλιμάκωση: προθεσμία φαίνεται μόνο αν ήδη υπάρχει (π.χ. μήνυμα φροντίδας) ή την όρισε άνθρωπος.
 *  - Διευκρινίσεις 13/10: ανάληψη έχουν ΜΟΝΟ οι συγκεκριμένες ενέργειες. Τα σήματα ασφάλειας (π.χ. «Χωρίς επαφή», κόκκινα σήματα)
 *    μένουν κοινή πληροφορία χωρίς ιδιοκτήτη — γι' αυτό δεν υπάρχει πια ενέργεια «Παρακολούθηση ανοιχτών σημάτων».
 *    Η ολοκλήρωση μιας ενέργειας (π.χ. του τηλεφωνήματος) δεν κλείνει το σήμα.
 *
 * Αυτό το αρχείο είναι καθαρή λογική (χωρίς βάση), ώστε να δοκιμάζεται.
 */

export type ActionKind =
  | "help" // κόκκινο κουμπί
  | "care" // μήνυμα φροντίδας
  | "safety_assessment" // αξιολόγηση αναγκών ασφάλειας
  | "initial_assessment" // αρχική αξιολόγηση
  | "cycle_review" // ανασκόπηση κύκλου
  | "admin_contact" // ενέργεια μόνο της διαχείρισης: τηλεφωνική επικοινωνία (χωρίς επαφή / ανάγκες ασφάλειας), νέος κύκλος
  | "step_read" // το μέλος ολοκλήρωσε βήμα/εργασία — να το διαβάσει ένας θεραπευτής (υπεύθυνη 17/10)
  | "signal_followup"; // παλιό (ως 13/10): μόνο για ιστορικό, δεν δημιουργείται πια

export type ActionState = "unclaimed" | "claimed" | "done";

export const STATE_LABEL: Record<ActionState, string> = {
  unclaimed: "Εκκρεμεί ανάληψη",
  claimed: "Έχει αναληφθεί",
  done: "Ολοκληρώθηκε",
};

export type ActionView = {
  key: string;
  kind: ActionKind;
  source: "item" | "care" | "help";
  memberId: string;
  memberName: string;
  title: string; // τι χρειάζεται να γίνει
  detail?: string; // αφορμή, σύντομα
  ownerRule: string; // ποιος το κάνει κατά τους κανόνες της ομάδας
  createdAt: Date | null;
  dueAt: Date | null;
  state: ActionState;
  claimedBy: string | null;
  claimedAt: Date | null;
  doneBy: string | null;
  doneAt: Date | null;
  doneNote: string;
  href: string;
  // Για τις φόρμες (ανάληψη/ολοκλήρωση):
  ref: string; // κλειδί αφορμής (item) ή id (care/help)
  needsClinician: boolean; // ανάληψη μόνο από ψυχολόγο (ή διαχείριση, κατά το υπάρχον canWriteRisk)
  adminOnly: boolean; // ανάληψη / ολοκλήρωση μόνο από τη διαχείριση (οι θεραπευτές βλέπουν την κατάσταση)
  manualDone: boolean; // ολοκληρώνεται με κουμπί (αλλιώς προκύπτει από τη δουλειά που γίνεται)
  doneLabel?: string; // λέξη του κουμπιού ολοκλήρωσης, αν δεν είναι «Ολοκληρώθηκε» (π.χ. «Το διάβασα»)
};

export type ItemRow = {
  memberId: string;
  kind: string;
  ref: string;
  createdAt: Date;
  dueAt: Date | null;
  claimedByName: string | null;
  claimedAt: Date | null;
  doneAt: Date | null;
  doneByName: string | null;
  doneNote: string;
};

export type CareRow = {
  id: string;
  kind: string;
  dueAt: Date;
  createdAt: Date;
  doneAt: Date | null;
  doneByName: string | null;
  claimedByName: string | null;
  claimedAt: Date | null;
  note: string;
};

export type HelpRowIn = {
  id: string;
  createdAt: Date;
  claimedByName: string | null;
  claimedAt: Date | null;
  talkedAt: Date | null;
  outcome?: string;
};

export const CARE_LABEL: Record<string, string> = {
  caring_24h: "Μήνυμα φροντίδας (24 ώρες μετά από κρίση)",
  caring_7d: "Μήνυμα φροντίδας (7 μέρες μετά από κρίση)",
  dropout: "Τηλεφωνική επικοινωνία από τη διαχείριση",
  risk_24h: "Τηλεφωνική επικοινωνία από τη διαχείριση",
  risk_next_day: "Τηλεφωνική επικοινωνία από τη διαχείριση",
  risk_contact: "Τηλεφωνική επικοινωνία από τη διαχείριση",
  new_cycle: "Νέος κύκλος: ενημέρωση του μέλους, συμφωνητικό και προεξόφληση",
};
/**
 * Ενέργειες μόνο της διαχείρισης: τα τηλεφωνήματα (τα τηλέφωνα τα βλέπει μόνο αυτή) και ο νέος κύκλος μετά το αυτόματο
 * κλείσιμο (συμφωνητικό, προεξόφληση — υπεύθυνη 17/10). Οι θεραπευτές ΔΕΝ τις βλέπουν («ό,τι αφορά τη διαχείριση το βλέπει
 * η διαχείριση»)· βλέπουν μόνο τα σήματα της ομάδας (π.χ. «Χ μέρες χωρίς καμία επαφή μαζί μας»).
 */
export const ADMIN_CARE = new Set(["dropout", "risk_24h", "risk_next_day", "risk_contact", "new_cycle"]);
/** Από αυτά, τα τηλεφωνήματα: η ολοκλήρωσή τους δεν κλείνει το σήμα. */
export const ADMIN_PHONE = new Set(["dropout", "risk_24h", "risk_next_day", "risk_contact"]);
const CARE_WHY: Record<string, string> = {
  dropout: "αφορμή: χωρίς επαφή",
  risk_24h: "αφορμή: αυξημένες ανάγκες ασφάλειας",
  risk_next_day: "αφορμή: υψηλές ανάγκες ασφάλειας",
  risk_contact: "αφορμή: ανάγκες ασφάλειας",
  new_cycle: "αφορμή: ο κύκλος ολοκληρώθηκε και αρχειοθετήθηκε",
};
export const CARE_WHO: Record<string, string> = {
  caring_24h: "η ομάδα",
  caring_7d: "η ομάδα",
  dropout: "η διαχείριση",
  risk_24h: "η διαχείριση",
  risk_next_day: "η διαχείριση",
  risk_contact: "η διαχείριση",
  new_cycle: "η διαχείριση",
};

function fromItem(base: Omit<ActionView, "state" | "claimedBy" | "claimedAt" | "doneBy" | "doneAt" | "doneNote" | "createdAt" | "dueAt">, createdAt: Date | null, row: ItemRow | undefined, ruleDueAt: Date | null = null): ActionView {
  const done = Boolean(row?.doneAt);
  return {
    ...base,
    createdAt: createdAt ?? row?.createdAt ?? null,
    dueAt: row?.dueAt ?? ruleDueAt,
    state: done ? "done" : row?.claimedAt ? "claimed" : "unclaimed",
    claimedBy: row?.claimedByName ?? null,
    claimedAt: row?.claimedAt ?? null,
    doneBy: row?.doneByName ?? null,
    doneAt: row?.doneAt ?? null,
    doneNote: row?.doneNote ?? "",
  };
}

export type ActionInput = {
  memberId: string;
  memberName: string;
  riskTrigger: { at: Date; text: string; dueAt?: Date | null } | null; // αφορμή για αξιολόγηση αναγκών ασφάλειας (δεν έχει γίνει ακόμα)· dueAt από τον κανόνα 14/10
  initialAssessmentMissing: { detail: string; since?: Date | null } | null;
  cycleReviewDue: { cycleId: string; lastTherapist?: string | null; since?: Date | null } | null;
  care: CareRow[]; // ανοιχτά
  help: HelpRowIn[]; // ανοιχτά κόκκινα κουμπιά (χωρίς «μίλησαν»)
  items: ItemRow[];
  stepsToRead?: { id: string; title: string; step: number | null; answeredAt: Date }[]; // βήματα/εργασίες που ολοκλήρωσε το μέλος και δεν τα διάβασε ακόμα κανείς
};

/** Ανοιχτές ενέργειες ενός μέλους. */
export function buildActions(i: ActionInput): ActionView[] {
  const out: ActionView[] = [];
  const row = (kind: string, ref: string) => i.items.find((r) => r.kind === kind && r.ref === ref);
  const common = { memberId: i.memberId, memberName: i.memberName };

  for (const h of i.help) {
    out.push({
      ...common, key: `help:${h.id}`, kind: "help", source: "help",
      title: "Κόκκινο κουμπί: να μιλήσει κάποιος μαζί του",
      ownerRule: "όποιος το αναλάβει",
      createdAt: h.createdAt, dueAt: null,
      state: h.talkedAt ? "done" : h.claimedAt ? "claimed" : "unclaimed",
      claimedBy: h.claimedByName, claimedAt: h.claimedAt, doneBy: h.talkedAt ? h.claimedByName : null, doneAt: h.talkedAt, doneNote: "",
      href: `/t/help/${h.id}`, ref: h.id, needsClinician: false, adminOnly: false, manualDone: false,
    });
  }
  if (i.riskTrigger) {
    const ref = `risk:${i.riskTrigger.at.toISOString()}`;
    out.push(fromItem({
      ...common, key: `safety_assessment:${ref}`, kind: "safety_assessment", source: "item",
      title: "Αξιολόγηση αναγκών ασφάλειας", detail: `μετά από ${i.riskTrigger.text}`,
      ownerRule: "ψυχολόγος", href: `/t/members/${i.memberId}/risk`, ref, needsClinician: true, adminOnly: false, manualDone: false,
    }, i.riskTrigger.at, row("safety_assessment", ref), i.riskTrigger.dueAt ?? null));
  }
  if (i.initialAssessmentMissing) {
    out.push(fromItem({
      ...common, key: "initial_assessment:initial", kind: "initial_assessment", source: "item",
      title: "Αρχική αξιολόγηση", detail: i.initialAssessmentMissing.detail,
      ownerRule: "ψυχολόγος, στην 1η ατομική (~40′)", href: `/t/members/${i.memberId}/assessment`, ref: "initial", needsClinician: true, adminOnly: false, manualDone: false,
    }, i.initialAssessmentMissing.since ?? null, row("initial_assessment", "initial")));
  }
  if (i.cycleReviewDue) {
    const ref = `cycle:${i.cycleReviewDue.cycleId}`;
    out.push(fromItem({
      ...common, key: `cycle_review:${ref}`, kind: "cycle_review", source: "item",
      title: "Κλείσιμο κύκλου (αρχειοθέτηση)", detail: "έγιναν οι ατομικές και οι ομάδες του κύκλου",
      ownerRule: i.cycleReviewDue.lastTherapist ? `όποιος είχε την τελευταία ατομική (${i.cycleReviewDue.lastTherapist})` : "όποιος είχε την τελευταία ατομική",
      href: `/t/members/${i.memberId}/cycle`, ref, needsClinician: false, adminOnly: false, manualDone: false,
    }, i.cycleReviewDue.since ?? null, row("cycle_review", ref)));
  }
  // Βήμα/εργασία που ολοκλήρωσε το μέλος (υπεύθυνη 17/10): «χρειάζεται να το αναλάβει κάποιος θεραπευτής για να το διαβάσει».
  // Ένας θεραπευτής το αναλαμβάνει, το διαβάζει στον φάκελο («Εργασίες») και πατά «Το διάβασα».
  for (const st of i.stepsToRead ?? []) {
    const ref = `assignment:${st.id}`;
    out.push(fromItem({
      ...common, key: `step_read:${ref}`, kind: "step_read", source: "item",
      title: st.step ? `Βήμα ${st.step} — το μέλος το ολοκλήρωσε, να το διαβάσει ένας θεραπευτής` : `Εργασία «${st.title}» — το μέλος την ολοκλήρωσε, να τη διαβάσει ένας θεραπευτής`,
      ownerRule: "όποιος θεραπευτής το αναλάβει", href: `/t/members/${i.memberId}/assignments`, ref, needsClinician: false, adminOnly: false, manualDone: true, doneLabel: "Το διάβασα",
    }, st.answeredAt, row("step_read", ref)));
  }
  for (const c of i.care) {
    const admin = ADMIN_CARE.has(c.kind);
    out.push({
      ...common, key: `care:${c.id}`, kind: admin ? "admin_contact" : "care", source: "care",
      title: CARE_LABEL[c.kind] ?? c.kind, ownerRule: CARE_WHO[c.kind] ?? "η ομάδα",
      detail: admin ? `${CARE_WHY[c.kind]}${ADMIN_PHONE.has(c.kind) ? " · η ολοκλήρωση δεν κλείνει το σήμα" : ""}` : undefined,
      createdAt: c.createdAt, dueAt: c.dueAt,
      state: c.doneAt ? "done" : c.claimedAt ? "claimed" : "unclaimed",
      claimedBy: c.claimedByName, claimedAt: c.claimedAt, doneBy: c.doneByName, doneAt: c.doneAt, doneNote: c.note,
      href: `/t/members/${i.memberId}`, ref: c.id, needsClinician: false, adminOnly: admin, manualDone: true,
    });
  }
  // Ανοιχτές πρώτα· μέσα στην ίδια κατάσταση, οι παλαιότερες πρώτα.
  const rank: Record<ActionState, number> = { unclaimed: 0, claimed: 1, done: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}

/** Σύντομη γραμμή «ποιος, πότε» για την κατάσταση. */
export function stateLine(a: ActionView, fmt: (d: Date) => string): string {
  if (a.state === "done") return `Ολοκληρώθηκε${a.doneBy ? ` από ${a.doneBy}` : ""}${a.doneAt ? ` · ${fmt(a.doneAt)}` : ""}`;
  if (a.state === "claimed") return `Έχει αναληφθεί από ${a.claimedBy ?? "—"}${a.claimedAt ? ` · ${fmt(a.claimedAt)}` : ""}`;
  return `κατά τους κανόνες: ${a.ownerRule}`;
}
