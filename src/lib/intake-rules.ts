// Κανόνες της λίστας έναρξης συνεργασίας και των συγκαταθέσεων (docs/clinical/README.md).
// Καθαρές συναρτήσεις, χωρίς βάση, για να ελέγχονται με tests.

export type StaffStep = {
  key: string;
  doc: string;
  label: string;
  /** Το σημειώνει μόνο ψυχολόγος (κλινική απόφαση). */
  psychologist?: boolean;
  /** Πρακτικό/διοικητικό βήμα: το βλέπει και το σημειώνει μόνο η διαχείριση. */
  admin?: boolean;
  /** Δεν χρειάζεται για να ολοκληρωθεί η έναρξη (γίνεται μόνο όταν υπάρχει λόγος). */
  optional?: boolean;
  /** Μόνο για μέλη που έρχονται από την ΑΥΤΟΓΝΩΣΙΑ PLUS. */
  autognosiaOnly?: boolean;
  hint?: string;
};

export const STAFF_STEPS: StaffStep[] = [
  { key: "online_consent", doc: "01α", label: "Συναίνεση για online υπηρεσίες ψυχολόγου και συμβουλευτικής", admin: true },
  { key: "agreement", doc: "01γ", label: "Συμφωνητικό συνεργασίας", admin: true },
  { key: "assessment", doc: "02", label: "Αρχική αξιολόγηση", psychologist: true, hint: "Την κάνει ψυχολόγος στην 1η ατομική (~40′). Σημειώνεται μόνη της όταν ολοκληρωθεί." },
  { key: "risk", doc: "03", label: "Αξιολόγηση αναγκών ασφάλειας", psychologist: true, optional: true, hint: "Μόνο όταν υπάρχει λόγος (υποτροπή, κόκκινο κουμπί, ανησυχία). Την κάνει ψυχολόγος." },
  {
    key: "safety_plan",
    optional: true,
    doc: "04",
    label: "Πλάνο ασφάλειας",
    hint: "Μόνο όταν υπάρχει λόγος· γράφεται μαζί, μέσα στην ατομική.",
  },
  { key: "autognosia_summary", doc: "09Γ", label: "Σύνοψη από ΑΥΤΟΓΝΩΣΙΑ PLUS", autognosiaOnly: true, hint: "Μόνο με ρητή συγκατάθεση (01β, 7α)." },
];

// Επίπεδα «αναγκών ασφάλειας» (αυτοτραυματισμός, υποτροπή, υπερδοσολογία). Δεν είναι πρόβλεψη:
// λένε τι χρειάζεται το μέλος από εμάς τώρα (βλ. NICE NG225, 2022).
export const RISK_LEVELS = { LOW: "Συνήθεις", MEDIUM: "Αυξημένες", HIGH: "Υψηλές" } as const;
export const RISK_INFO: Record<keyof typeof RISK_LEVELS, { means: string; action: string }> = {
  LOW: {
    means: "Χωρίς σκέψεις ή σχέδιο αυτοτραυματισμού, χωρίς πρόσφατη υπερδοσολογία· σταθερή πορεία ή αποχή, επαρκής υποστήριξη.",
    action: "Κανονική ροή.",
  },
  MEDIUM: {
    means: "Παθητικές σκέψεις, πρόσφατη υποτροπή, δύσκολο γεγονός, απομόνωση ή πρόσφατη αποχή (μειωμένη ανοχή).",
    action: "Πλάνο ασφάλειας στην ίδια ατομική· επαφή μέσα σε 24 ώρες· ξανά αξιολόγηση στην επόμενη ατομική.",
  },
  HIGH: {
    means: "Ενεργές σκέψεις με σχέδιο ή πρόθεση, πρόσφατη απόπειρα ή υπερδοσολογία, χρήση σε μοναξιά ή πολλών ουσιών.",
    action: "Μένουμε με το μέλος στη γραμμή· 112/166 σε άμεσο κίνδυνο, αλλιώς παραπομπή· ενημέρωση διαχείρισης· επαφή την επόμενη μέρα.",
  },
};

export type Choice = "YES" | "NO" | "NA" | "LATER";

export type Purpose = {
  key: string;
  doc: string;
  label: string;
  text: string;
  required?: boolean;
  choices: Choice[];
  /** Χρειάζεται στοιχεία (π.χ. όνομα/τηλέφωνο επαφής). */
  detail?: string;
  /** Την αποδέχεται το ίδιο το μέλος μέσα στο app. */
  byMember?: boolean;
};

export const PURPOSES: Purpose[] = [
  { key: "record", doc: "01β·1", label: "Φάκελος και σημειώματα", required: true, choices: ["YES", "NO"],
    text: "Τηρείται φάκελος με στοιχεία, αξιολογήσεις, πλάνο και σύντομα σημειώματα, και τον βλέπει όλη η ομάδα (ψυχολόγοι και βιωματικοί σύμβουλοι)." },
  { key: "journal", doc: "01β·2", label: "Ημερολόγιο ανάκαμψης στο app", choices: ["YES", "NO"],
    text: "Γράφω κάθε βράδυ στο Apex πώς είμαι. Ό,τι γράφω εκεί το βλέπει μόνο η ομάδα μου." },
  { key: "forms", doc: "01β·3", label: "Φόρμες θεματικής σε Google με κωδικό", choices: ["YES", "NO"],
    text: "Συμπληρώνω τις φόρμες στο Google Forms με τον κωδικό μου αντί για το όνομά μου." },
  { key: "telegram", doc: "01β·4", label: "Ειδοποίηση της ομάδας μέσω Telegram", choices: ["YES", "NO"],
    text: "Στο κόκκινο κουμπί πηγαίνει στο Telegram της ομάδας το μικρό μου όνομα και το αρχικό του επωνύμου. Αν όχι, η ειδοποίηση πηγαίνει μόνο μέσα από το app." },
  { key: "self_message", doc: "01β·5", label: "Ηχογραφημένο μήνυμα για τον εαυτό μου", choices: ["YES", "NO"],
    text: "Ένα μήνυμα που φυλάσσεται στο app και παίζει μόνο όταν πατάω το κόκκινο κουμπί." },
  { key: "emergency_contact", doc: "01β·6", label: "Επαφή έκτακτης ανάγκης", choices: ["YES", "NO"],
    detail: "Όνομα, τηλέφωνο, σχέση και τι επιτρέπεται να του/της πείτε",
    text: "Επικοινωνία μαζί του/της μόνο σε σοβαρό κίνδυνο για τη ζωή μου ή αν χαθεί κάθε επαφή." },
  { key: "autognosia_in", doc: "01β·7α", label: "Σύνοψη από ΑΥΤΟΓΝΩΣΙΑ PLUS προς εμάς", choices: ["YES", "NO", "NA"],
    text: "Η ΑΥΤΟΓΝΩΣΙΑ PLUS (ξεχωριστή εταιρεία) μας δίνει σύνοψη από τη διαμονή μου εκεί." },
  { key: "autognosia_out", doc: "01β·7β", label: "Σύνοψη από εμάς προς ΑΥΤΟΓΝΩΣΙΑ PLUS", choices: ["YES", "NO", "NA", "LATER"],
    text: "Αν πάω στην ΑΥΤΟΓΝΩΣΙΑ PLUS, της στέλνετε σύνοψη της συνεργασίας μας." },
  { key: "confidentiality", doc: "01δ", label: "Δήλωση εμπιστευτικότητας μέλους", required: true, choices: ["YES"], byMember: true,
    text: "Ό,τι ακούω στην ομάδα και στο Therapair μένει εκεί." },
];

export const CHOICE_LABEL: Record<Choice, string> = { YES: "Ναι", NO: "Όχι", NA: "Δεν ισχύει", LATER: "Αργότερα" };

export type IntakeStatus = {
  missingSteps: StaffStep[];
  missingConsents: Purpose[];
  complete: boolean;
};

export function intakeStatus(input: {
  source: "APEX" | "AUTOGNOSIA_PLUS" | null;
  done: string[];
  consents: Record<string, Choice | undefined>;
}): IntakeStatus {
  const missingSteps = STAFF_STEPS.filter((s) => !s.optional && (!s.autognosiaOnly || input.source === "AUTOGNOSIA_PLUS") && !input.done.includes(s.key));
  // Απαραίτητα: «Ναι» στον φάκελο και στην εμπιστευτικότητα· για τα υπόλοιπα αρκεί να έχει καταγραφεί επιλογή.
  const missingConsents = PURPOSES.filter((p) => {
    const c = input.consents[p.key];
    if (p.required) return c !== "YES";
    if (p.key.startsWith("autognosia") && input.source !== "AUTOGNOSIA_PLUS") return false;
    return c === undefined;
  });
  return { missingSteps, missingConsents, complete: missingSteps.length === 0 && missingConsents.length === 0 };
}

/** Την ισχύουσα επιλογή για κάθε σκοπό: η πιο πρόσφατη εγγραφή. */
export function latestChoices(rows: { purpose: string; choice: string; recordedAt: Date }[]): Record<string, Choice> {
  const out: Record<string, { c: Choice; at: number }> = {};
  for (const r of rows) {
    const at = r.recordedAt.getTime();
    if (!out[r.purpose] || out[r.purpose].at <= at) out[r.purpose] = { c: r.choice as Choice, at };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.c]));
}

/** Ποιος επαγγελματίας μπορεί να σημειώσει ένα βήμα. */
export function canMarkStep(step: StaffStep, therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null): boolean {
  return !step.psychologist || therapistKind === "CLINICAL" || therapistKind === "BOTH";
}
