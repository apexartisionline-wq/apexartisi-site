/**
 * Επόμενες ενέργειες (13/10): για κάθε ενέργεια — τι χρειάζεται, ποιος την αναλαμβάνει, πότε δημιουργήθηκε,
 * προθεσμία (μόνο αν ορίστηκε από άνθρωπο ή υπάρχει ήδη στον κανόνα), κατάσταση, πότε και από ποιον ολοκληρώθηκε.
 *
 * Κανόνες:
 *  - «Το είδα» ≠ «Το ανέλαβα» ≠ «Ολοκληρώθηκε». Η ανάγνωση ειδοποίησης δεν ολοκληρώνει την ενέργεια.
 *  - Η λήξη των 24 ωρών μιας ειδοποίησης δεν κλείνει το θέμα· η ενέργεια μένει ανοιχτή.
 *  - Η διαχείριση συντονίζει· η θεραπευτική ευθύνη παραμένει συλλογική. Η ανάθεση αφορά μια συγκεκριμένη ενέργεια.
 *  - Καμία αυτόματη κλινική προθεσμία ή κλιμάκωση: προθεσμία φαίνεται μόνο αν ήδη υπάρχει (π.χ. μήνυμα φροντίδας) ή την όρισε άνθρωπος.
 *
 * Αυτό το αρχείο είναι καθαρή λογική (χωρίς βάση), ώστε να δοκιμάζεται.
 */

export type ActionKind =
  | "help" // κόκκινο κουμπί
  | "care" // μήνυμα φροντίδας
  | "safety_assessment" // αξιολόγηση αναγκών ασφάλειας
  | "initial_assessment" // αρχική αξιολόγηση
  | "cycle_review" // ανασκόπηση κύκλου
  | "signal_followup"; // παρακολούθηση ανοιχτών σημάτων

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
  manualDone: boolean; // ολοκληρώνεται με κουμπί (αλλιώς προκύπτει από τη δουλειά που γίνεται)
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
  dropout: "Επικοινωνία με το μέλος (χωρίς επαφή εδώ και μέρες)",
  risk_24h: "Επαφή με το μέλος (αυξημένες ανάγκες ασφάλειας)",
  risk_next_day: "Επαφή με το μέλος (υψηλές ανάγκες ασφάλειας)",
  risk_contact: "Επαφή με το μέλος (ανάγκες ασφάλειας)",
};
export const CARE_WHO: Record<string, string> = {
  caring_24h: "η ομάδα",
  caring_7d: "η ομάδα",
  dropout: "η διαχείριση (τηλέφωνο)",
  risk_24h: "η διαχείριση (τηλέφωνο)",
  risk_next_day: "η διαχείριση (τηλέφωνο)",
  risk_contact: "η διαχείριση (τηλέφωνο)",
};

function fromItem(base: Omit<ActionView, "state" | "claimedBy" | "claimedAt" | "doneBy" | "doneAt" | "doneNote" | "createdAt" | "dueAt">, createdAt: Date | null, row: ItemRow | undefined): ActionView {
  const done = Boolean(row?.doneAt);
  return {
    ...base,
    createdAt: createdAt ?? row?.createdAt ?? null,
    dueAt: row?.dueAt ?? null,
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
  riskTrigger: { at: Date; text: string } | null; // αφορμή για αξιολόγηση αναγκών ασφάλειας (δεν έχει γίνει ακόμα)
  redSignals: { text: string; at?: Date | null }[]; // ανοιχτά κόκκινα σήματα (εκτός από την αξιολόγηση αναγκών)
  initialAssessmentMissing: { detail: string; since?: Date | null } | null;
  cycleReviewDue: { cycleId: string; lastTherapist?: string | null; since?: Date | null } | null;
  care: CareRow[]; // ανοιχτά
  help: HelpRowIn[]; // ανοιχτά κόκκινα κουμπιά (χωρίς «μίλησαν»)
  items: ItemRow[];
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
      href: `/t/help/${h.id}`, ref: h.id, needsClinician: false, manualDone: false,
    });
  }
  if (i.riskTrigger) {
    const ref = `risk:${i.riskTrigger.at.toISOString()}`;
    out.push(fromItem({
      ...common, key: `safety_assessment:${ref}`, kind: "safety_assessment", source: "item",
      title: "Αξιολόγηση αναγκών ασφάλειας", detail: `μετά από ${i.riskTrigger.text}`,
      ownerRule: "ψυχολόγος", href: `/t/members/${i.memberId}/risk`, ref, needsClinician: true, manualDone: false,
    }, i.riskTrigger.at, row("safety_assessment", ref)));
  }
  if (i.initialAssessmentMissing) {
    out.push(fromItem({
      ...common, key: "initial_assessment:initial", kind: "initial_assessment", source: "item",
      title: "Αρχική αξιολόγηση", detail: i.initialAssessmentMissing.detail,
      ownerRule: "ψυχολόγος, στην 1η ατομική (~40′)", href: `/t/members/${i.memberId}/assessment`, ref: "initial", needsClinician: true, manualDone: false,
    }, i.initialAssessmentMissing.since ?? null, row("initial_assessment", "initial")));
  }
  if (i.cycleReviewDue) {
    const ref = `cycle:${i.cycleReviewDue.cycleId}`;
    out.push(fromItem({
      ...common, key: `cycle_review:${ref}`, kind: "cycle_review", source: "item",
      title: "Ανασκόπηση κύκλου (2 γραμμές)", detail: "ολοκληρώθηκαν οι ατομικές του κύκλου",
      ownerRule: i.cycleReviewDue.lastTherapist ? `όποιος είχε την τελευταία ατομική (${i.cycleReviewDue.lastTherapist})` : "όποιος είχε την τελευταία ατομική",
      href: `/t/members/${i.memberId}/cycle`, ref, needsClinician: false, manualDone: false,
    }, i.cycleReviewDue.since ?? null, row("cycle_review", ref)));
  }
  if (i.redSignals.length > 0) {
    const times = i.redSignals.map((s) => s.at?.getTime() ?? 0);
    const latest = new Date(Math.max(...times, 0));
    const ref = `signal:${latest.toISOString()}`;
    out.push(fromItem({
      ...common, key: `signal_followup:${ref}`, kind: "signal_followup", source: "item",
      title: "Παρακολούθηση ανοιχτών σημάτων ασφάλειας",
      detail: i.redSignals.slice(0, 2).map((s) => s.text).join(" · ") + (i.redSignals.length > 2 ? ` · +${i.redSignals.length - 2}` : ""),
      ownerRule: "όποιος έχει την επόμενη επαφή",
      href: `/t/members/${i.memberId}`, ref, needsClinician: false, manualDone: true,
    }, latest.getTime() > 0 ? latest : null, row("signal_followup", ref)));
  }
  for (const c of i.care) {
    out.push({
      ...common, key: `care:${c.id}`, kind: "care", source: "care",
      title: CARE_LABEL[c.kind] ?? c.kind, ownerRule: CARE_WHO[c.kind] ?? "η ομάδα",
      createdAt: c.createdAt, dueAt: c.dueAt,
      state: c.doneAt ? "done" : c.claimedAt ? "claimed" : "unclaimed",
      claimedBy: c.claimedByName, claimedAt: c.claimedAt, doneBy: c.doneByName, doneAt: c.doneAt, doneNote: c.note,
      href: `/t/members/${i.memberId}`, ref: c.id, needsClinician: false, manualDone: true,
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
