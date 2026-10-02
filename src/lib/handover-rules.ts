// Κανόνες της «ζώνης ασφαλείας» στην καρτέλα μέλους (χωρίς AI, χωρίς το ημερολόγιο).
// Απλοί και ορατοί: κάθε σήμα λέει τι το προκάλεσε και πότε.

export const RISK_CHANGE = { UP: "Αυξήθηκε", SAME: "Ίδιος", DOWN: "Μειώθηκε" } as const;
export const USED_SINCE = { YES: "Ναι", NO: "Όχι", UNKNOWN: "Δεν ξέρουμε" } as const;
export type RiskChange = keyof typeof RISK_CHANGE;
export type UsedSince = keyof typeof USED_SINCE;

// Σύνοψη περίπτωσης: γράφεται και ενημερώνεται από θεραπευτή, όχι αυτόματα.
export const CASE_FIELDS = [
  { key: "goal", label: "Ουσία/ες και στόχος", hint: "π.χ. αλκοόλ· αποχή" },
  { key: "triggers", label: "Καταστάσεις υψηλού κινδύνου", hint: "άνθρωποι, μέρη, ώρες, συναισθήματα" },
  { key: "helps", label: "Τι βοηθά", hint: "προστατευτικοί παράγοντες, στρατηγικές που δούλεψαν" },
  { key: "notHelps", label: "Τι δεν βοήθησε", hint: "" },
  { key: "open", label: "Εκκρεμότητες / τι έχει συμφωνηθεί", hint: "" },
  { key: "next", label: "Για τον επόμενο θεραπευτή", hint: "τι να προσέξει ή να ρωτήσει" },
] as const;
export type CaseData = Partial<Record<(typeof CASE_FIELDS)[number]["key"], string>>;

export type Flag = { level: "red" | "yellow"; text: string; at?: Date; href?: string };

export type SafetyInput = {
  now: Date;
  risk: { value: string | null; at: Date } | null;
  safetyPlanAt: Date | null;
  helpRequests: { createdAt: Date }[];
  notes: { at: Date; riskChange: string | null; usedSince: string | null; slotId: string }[];
  lastContact: Date | null;
  openDropout: boolean;
  dropoutDays: number;
  intakeComplete: boolean;
};

const DAY = 24 * 3600_000;
const daysAgo = (now: Date, d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

/** Σήματα ασφαλείας, πρώτα τα κόκκινα και μετά τα πιο πρόσφατα. */
export function safetyFlags(x: SafetyInput): Flag[] {
  const flags: Flag[] = [];
  const within = (d: Date, days: number) => x.now.getTime() - d.getTime() <= days * DAY;

  const help = x.helpRequests.filter((h) => within(h.createdAt, 14));
  if (help.length > 0) {
    const last = help.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt;
    flags.push({ level: "red", text: `Κόκκινο κουμπί: ${help.length} φορ${help.length === 1 ? "ά" : "ές"} τις τελευταίες 14 μέρες`, at: last });
  }

  if (x.risk?.value === "HIGH") flags.push({ level: "red", text: "Υψηλός κίνδυνος στην αξιολόγηση", at: x.risk.at });
  else if (!x.risk && x.intakeComplete) flags.push({ level: "yellow", text: "Δεν υπάρχει αξιολόγηση κινδύνου" });

  if (!x.safetyPlanAt) {
    flags.push({ level: x.risk?.value === "HIGH" ? "red" : "yellow", text: "Δεν υπάρχει πλάνο ασφάλειας", href: "safety" });
  } else if (!within(x.safetyPlanAt, 90)) {
    flags.push({ level: "yellow", text: `Το πλάνο ασφάλειας δεν έχει αναθεωρηθεί ${daysAgo(x.now, x.safetyPlanAt)} μέρες`, at: x.safetyPlanAt, href: "safety" });
  }

  const recent = x.notes.filter((n) => within(n.at, 30)).sort((a, b) => b.at.getTime() - a.at.getTime());
  const up = recent.find((n) => n.riskChange === "UP");
  if (up) flags.push({ level: "red", text: "Σημείωμα: ο κίνδυνος αυξήθηκε", at: up.at, href: `/t/s/${up.slotId}` });
  const used = recent.find((n) => n.usedSince === "YES");
  if (used) flags.push({ level: "red", text: "Σημείωμα: χρήση από την προηγούμενη επαφή", at: used.at, href: `/t/s/${used.slotId}` });

  if (x.openDropout) flags.push({ level: "yellow", text: "Εκκρεμεί τηλεφώνημα (χωρίς επαφή)" });
  else if (x.lastContact && !within(x.lastContact, x.dropoutDays)) {
    flags.push({ level: "yellow", text: `Χωρίς επαφή ${daysAgo(x.now, x.lastContact)} μέρες`, at: x.lastContact });
  }

  const rank = { red: 0, yellow: 1 };
  return flags.sort((a, b) => rank[a.level] - rank[b.level] || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

export type NoteFilter = { therapistId?: string; from?: string; to?: string; q?: string; risk?: boolean; used?: boolean };

/** Φίλτρο σημειωμάτων (στη μνήμη, γιατί το κείμενο είναι κρυπτογραφημένο στη βάση). */
export function matchNote(
  n: { therapistId: string; date: string; text: string; riskChange: string | null; usedSince: string | null },
  f: NoteFilter,
): boolean {
  if (f.therapistId && n.therapistId !== f.therapistId) return false;
  if (f.from && n.date < f.from) return false;
  if (f.to && n.date > f.to) return false;
  if (f.risk && n.riskChange !== "UP") return false;
  if (f.used && n.usedSince !== "YES") return false;
  if (f.q) {
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (!norm(n.text).includes(norm(f.q.trim()))) return false;
  }
  return true;
}
