// Κανόνες της «ζώνης ασφάλειας» στην καρτέλα μέλους (χωρίς AI, χωρίς το ημερολόγιο).
// Απλοί και ορατοί: κάθε σήμα λέει τι το προκάλεσε και πότε.

export const RISK_CHANGE = { UP: "Αυξήθηκαν", SAME: "Ίδιες", DOWN: "Μειώθηκαν" } as const; // ανάγκες ασφάλειας
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
  { key: "next", label: "Για την επόμενη ατομική", hint: "τι να προσέξει ή να ρωτήσει" },
] as const;
export type CaseData = Partial<Record<(typeof CASE_FIELDS)[number]["key"], string>>;

export type Flag = { level: "red" | "yellow"; text: string; at?: Date; href?: string; key?: string };

// «Χρειάζεται προσοχή» με κατανοητές λέξεις (υπεύθυνη 17/10): εκεί μπαίνει (α) όποιος έχει 3 μέρες συνεχόμενες χωρίς καμία
// επαφή μαζί μας, (β) όποιος γράφει έντονες επιθυμίες στο ημερολόγιο, (γ) το νέο μέλος, που τις πρώτες μέρες θέλει
// παραπάνω φροντίδα και παρακολούθηση. Όρια απλά και ορατά — ΠΡΟΣ ΕΓΚΡΙΣΗ από την υπεύθυνη:
export const CRAVING_HIGH = 6; // λαχτάρα ≥ 6/10 στο ημερολόγιο = «έντονη επιθυμία» (ίδιο όριο με το picture.ts και τη σύνοψη κύκλου)
export const CRAVING_DAYS = 7; // κοιτάμε τις τελευταίες 7 μέρες
export const NEW_MEMBER_DAYS = 14; // «πρώτες μέρες» του νέου μέλους: 14 από την έναρξη του προγράμματος

export type SafetyInput = {
  now: Date;
  risk: { value: string | null; at: Date } | null;
  safetyPlanAt: Date | null;
  helpRequests: { createdAt: Date }[];
  notes: { at: Date; riskChange: string | null; usedSince: string | null; slotId: string }[];
  missed: { at: Date; slotId: string; noted?: boolean }[]; // ατομικές που πέρασαν χωρίς καταγεγραμμένη σύνδεση· noted = ο θεραπευτής έγραψε «Δεν ήρθε»
  lastContact: Date | null;
  openDropout: boolean;
  dropoutDays: number;
  intakeComplete: boolean;
  cravings?: { date: string; craving: number; at: Date }[]; // καταχωρίσεις ημερολογίου με λαχτάρα ≥ CRAVING_HIGH (τελευταίες 7 μέρες)
  programStart?: Date | null; // έναρξη προγράμματος (programStartDate, αλλιώς δημιουργία λογαριασμού)
};

const DAY = 24 * 3600_000;
const daysAgo = (now: Date, d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dmy = (iso: string) => iso.slice(8, 10).replace(/^0/, "") + "/" + iso.slice(5, 7).replace(/^0/, "");

/** Σήματα ασφάλειας: πρώτα τα κόκκινα, και μέσα σε κάθε χρώμα με σειρά σπουδαιότητας. */
export function safetyFlags(x: SafetyInput): Flag[] {
  const flags: Flag[] = [];
  const within = (d: Date, days: number) => x.now.getTime() - d.getTime() <= days * DAY;

  const help = x.helpRequests.filter((h) => within(h.createdAt, 14));
  if (help.length > 0) {
    const last = help.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt;
    flags.push({ level: "red", text: `Πάτησε το κόκκινο κουμπί: ${help.length} φορ${help.length === 1 ? "ά" : "ές"} τις τελευταίες 14 μέρες`, at: last });
  }

  if (x.risk?.value === "HIGH") flags.push({ level: "red", text: "Υψηλές ανάγκες ασφάλειας", at: x.risk.at });
  else if (x.risk?.value === "MEDIUM") flags.push({ level: "yellow", text: "Αυξημένες ανάγκες ασφάλειας", at: x.risk.at });
  // Η αξιολόγηση γίνεται μόνο όταν υπάρχει λόγος (απόφαση υπεύθυνης): η υπενθύμιση βγαίνει από τις αφορμές (risk-db.ts).

  // Πλάνο ασφάλειας: μόνο όταν υπάρχει λόγος (απόφαση υπεύθυνης) — χωρίς σήματα «δεν υπάρχει / αναθεώρηση».

  const recent = x.notes.filter((n) => within(n.at, 30)).sort((a, b) => b.at.getTime() - a.at.getTime());
  const up = recent.find((n) => n.riskChange === "UP");
  if (up) flags.push({ level: "red", text: "Στο σημείωμα: αυξήθηκαν οι ανάγκες ασφάλειας", at: up.at, href: `/t/s/${up.slotId}` });
  const used = recent.find((n) => n.usedSince === "YES");
  if (used) flags.push({ level: "red", text: "Στο σημείωμα: έκανε χρήση από την προηγούμενη επαφή", at: used.at, href: `/t/s/${used.slotId}` });

  // Χρήση «δεν ξέρουμε» μετράει μόνο αν είναι η πιο πρόσφατη απάντηση.
  const lastUse = recent.find((n) => n.usedSince);
  if (lastUse?.usedSince === "UNKNOWN") {
    flags.push({ level: "yellow", text: "Δεν ξέρουμε αν έκανε χρήση (τελευταίο σημείωμα)", at: lastUse.at, href: `/t/s/${lastUse.slotId}` });
  }

  // Χαμένη ατομική τις τελευταίες 14 μέρες· κόκκινο αν υπάρχει ήδη σήμα ασφάλειας.
  const missed = x.missed.filter((m) => within(m.at, 14)).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (missed) {
    const afterRisk = flags.some((f) => f.level === "red");
    flags.push({
      level: afterRisk ? "red" : "yellow",
      // Κλειδί μόνο για φίλτρα (σελίδα «Μέλη»): «missed» = «Δεν ήρθε», «no_record» = «Χωρίς καταγραφή». Ο κανόνας δεν άλλαξε.
      key: missed.noted ? "missed" : "no_record",
      text: `${missed.noted ? "Δεν ήρθε στην ατομική (επιβεβαίωση θεραπευτή)" : "Χωρίς καταγραφή παρουσίας στην ατομική"}${afterRisk ? ", μετά από σήμα ασφάλειας" : ""}`,
      at: missed.at,
      href: `/t/s/${missed.slotId}`,
    });
  }

  // Σήμα «Χωρίς επαφή» (διευκρινίσεις 13/10): κοινή πληροφορία χωρίς ιδιοκτήτη, μένει όσο δεν υπάρχει νέα επαφή.
  // Η ενέργεια «Τηλεφωνική επικοινωνία από τη διαχείριση» είναι ξεχωριστή (με ανάληψη)· η ολοκλήρωσή της δεν κλείνει το σήμα.
  // Λέξεις (υπεύθυνη 17/10, αντί για «Χωρίς επαφή Χ μέρες»): λέει τι ακριβώς δεν έγινε.
  const noContactWhat = "ούτε ομάδα, ούτε απογραφή, ούτε ατομική";
  if (x.lastContact && !within(x.lastContact, x.dropoutDays)) {
    flags.push({ level: "yellow", key: "no_contact", text: `${plural(daysAgo(x.now, x.lastContact), "μέρα", "μέρες")} χωρίς καμία επαφή μαζί μας (${noContactWhat})`, at: x.lastContact });
  } else if (!x.lastContact && x.openDropout) {
    flags.push({ level: "yellow", key: "no_contact", text: `Χωρίς καμία επαφή μαζί μας ακόμα (${noContactWhat})` });
  }

  // Έντονες επιθυμίες στο ημερολόγιο (τελευταίες 7 μέρες): μία γραμμή με τον μεγαλύτερο αριθμό και πόσες μέρες.
  const strong = (x.cravings ?? []).filter((c) => c.craving >= CRAVING_HIGH && within(c.at, CRAVING_DAYS)).sort((a, b) => b.date.localeCompare(a.date));
  if (strong.length > 0) {
    const top = strong.reduce((a, b) => (b.craving > a.craving ? b : a));
    flags.push({
      level: "yellow", key: "craving", at: strong[0].at,
      text: `Έντονες επιθυμίες στο ημερολόγιο: λαχτάρα ${top.craving}/10 στις ${dmy(top.date)}${strong.length > 1 ? ` · ${plural(strong.length, "μέρα", "μέρες")} τις τελευταίες ${CRAVING_DAYS}` : ""} — ρώτα το στην επόμενη επαφή`,
    });
  }

  // Νέο μέλος: τις πρώτες μέρες παραπάνω φροντίδα και παρακολούθηση.
  if (x.programStart && x.programStart <= x.now && within(x.programStart, NEW_MEMBER_DAYS)) {
    const d = daysAgo(x.now, x.programStart);
    flags.push({
      level: "yellow", key: "new_member", at: x.programStart,
      text: `Νέο μέλος — ${d === 0 ? "ξεκίνησε σήμερα" : `ξεκίνησε πριν ${plural(d, "μέρα", "μέρες")}`}: τις πρώτες ${NEW_MEMBER_DAYS} μέρες παραπάνω φροντίδα και παρακολούθηση`,
    });
  }

  const rank = { red: 0, yellow: 1 };
  return flags.sort((a, b) => rank[a.level] - rank[b.level]); // σταθερή ταξινόμηση: κρατά τη σειρά σπουδαιότητας
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
    // Χωρίς τόνους/κεφαλαία, και κάθε λέξη με όποια κατάληξη («πατερας» βρίσκει «πατέρα», «πατέρες»).
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/ς/g, "σ");
    const stem = (w: string) => (w.length > 4 ? w.replace(/(ουσ|οσ|ου|ησ|ασ|εσ|ισ|ων|οι|ο|ε|η|α|ι)$/, "") : w);
    const text = norm(n.text);
    if (!norm(f.q.trim()).split(/\s+/).filter(Boolean).every((w) => text.includes(stem(w)))) return false;
  }
  return true;
}
