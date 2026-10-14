/**
 * Εικόνα μιας περιόδου για ένα μέλος — ΜΙΑ λογική για το «Με μια ματιά» (ατομική, προετοιμασία, Therapair, φάκελος),
 * τη «Συνέπεια» και τον κύκλο. Αποφάσεις υπεύθυνης 14/10 (docs/reviews/2026-10-14-me-mia-matia-synepeia-orismoi.md):
 *
 *  - Περίοδοι: «Εβδομάδα» = οι τελευταίες 7 ημέρες (ή τα προηγούμενα 7ήμερα)· «Μήνας» = ο κύκλος του μέλους
 *    (το σύνολο των συνεδριών: 8 ατομικές και 16 ομάδες). Πάντα με ημερομηνίες στην οθόνη.
 *  - Ατομικές: κάθε κράτηση σε ΜΙΑ κατάσταση (παρουσία με πηγή, «Δεν ήρθε», χωρίς καταγραφή = εκκρεμεί, σε εξέλιξη, επόμενη).
 *    Ακυρωμένες και μεταφερμένες: ΠΟΤΕ στα κλάσματα, μόνο ως πληροφορία.
 *  - Ομάδες: παρουσία ή χωρίς καταγραφή· «δεν έγινε» εκτός κλασμάτων· «πριν την ένταξη» δεν φαίνεται.
 *  - Ποσοστό: μόνο δίπλα σε πλήρες κείμενο και μόνο όταν πέρασε ≥ 1· οι «χωρίς καταγραφή» μετρούν στον παρονομαστή
 *    (κανόνας 13/10 — το λέει ρητά το κείμενο). Το φίλτρο «χαμηλότερη συμμετοχή» μετρά στις ατομικές μόνο τα «Δεν ήρθε».
 *  - Ημερολόγιο: παρονομαστής = μόνο οι μέρες που ΜΠΟΡΟΥΣΑΝ να έχουν εγγραφή (από την έναρξη, ως τη χθεσινή ή τη σημερινή
 *    μετά την ώρα του ημερολογίου)· μέσοι όροι μόνο με ≥ MIN_FOR_AVG καταχωρίσεις και πάντα με το πλήθος.
 *  - Στόχος (8/16) χωριστά από «προγραμματισμένες».
 *
 * Καθαρή λογική, χωρίς βάση. Τα κείμενα βγαίνουν ΜΟΝΟ από το αντικείμενο της εικόνας (describe*), και το checkPicture
 * ελέγχει ότι οι ταυτότητες ισχύουν — ώστε αριθμητής, παρονομαστής και επεξήγηση να μην μπορούν να διαφωνούν.
 */
import type { GroupState } from "./group-presence";
import { countsAsCame, type Presence } from "./presence";

export const MIN_FOR_AVG = 3;

export type PeriodKind = "week" | "month";
export type Period = {
  kind: PeriodKind;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (για ανοιχτό κύκλο: σήμερα)
  label: string; // «Τελευταίες 7 ημέρες · 8/10–14/10» ή «Μήνας 2 · από 28/9 — σε εξέλιξη»
  open: boolean; // ανοιχτός κύκλος / τρέχον 7ήμερο
  clippedFrom: string | null; // αν κόπηκε στην έναρξη προγράμματος
};

export type SessionItem = { id: string; date: string; startsAt: Date; pair: boolean; state: Presence; joinedAt: Date | null; therapist?: string | null };
export type CancelledItem = { date: string; startsAt: Date; pair: boolean; at: Date; by: string; reason: string };
export type MovedItem = { date: string; startsAt: Date; toDate: string; toStartsAt: Date; at: Date; by: string };

export type SessionPicture = {
  target: number | null; // στόχος μήνα (μόνο σε «Μήνα»)
  scheduled: number; // προγραμματισμένες στην περίοδο (χωρίς ακυρωμένες/μεταφερμένες)
  passed: number; // πέρασαν = παρονομαστής
  present: number; // παρουσίες = αριθμητής
  presentConfirmed: number;
  presentJoin: number;
  absent: number; // «Δεν ήρθε»
  noRecord: number; // εκκρεμεί
  inProgress: number;
  upcoming: number; // επόμενες (δεν άρχισαν)
  cancelled: number;
  moved: number;
  pct: number | null;
  items: SessionItem[];
  cancelledItems: CancelledItem[];
  movedItems: MovedItem[];
};

export function sessionPicture(items: SessionItem[], o: { target?: number | null; cancelled?: CancelledItem[]; moved?: MovedItem[] } = {}): SessionPicture {
  const n = (p: Presence) => items.filter((x) => x.state === p).length;
  const present = items.filter((x) => countsAsCame(x.state)).length;
  const absent = n("absent_confirmed");
  const noRecord = n("no_record");
  const inProgress = n("in_progress");
  const upcoming = n("future");
  const passed = present + absent + noRecord;
  return {
    target: o.target ?? null,
    scheduled: items.length,
    passed,
    present,
    presentConfirmed: n("present_confirmed"),
    presentJoin: n("present_join"),
    absent,
    noRecord,
    inProgress,
    upcoming,
    cancelled: o.cancelled?.length ?? 0,
    moved: o.moved?.length ?? 0,
    pct: pct(present, passed),
    items: [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    cancelledItems: o.cancelled ?? [],
    movedItems: o.moved ?? [],
  };
}

export type GroupItem = { date: string; time: string; startsAt: Date; state: GroupState };

export type GroupPicture = {
  target: number | null;
  scheduled: number; // στο πρόγραμμα της περιόδου (μετά την ένταξη), μαζί με «δεν έγινε» και επόμενες
  passed: number; // παρονομαστής
  present: number; // αριθμητής
  noRecord: number;
  upcoming: number;
  notHeld: number;
  pct: number | null;
  items: GroupItem[];
};

export function groupPicture(rows: GroupItem[], o: { target?: number | null } = {}): GroupPicture {
  const items = rows.filter((r) => r.state !== "before_join").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const n = (s: GroupState) => items.filter((r) => r.state === s).length;
  const present = n("present"), noRecord = n("no_record"), upcoming = n("future"), notHeld = n("not_held");
  return { target: o.target ?? null, scheduled: items.length, passed: present + noRecord, present, noRecord, upcoming, notHeld, pct: pct(present, present + noRecord), items };
}

export type JournalEntryNum = { date: string; mood: number; craving: number; sleep: number; confidence: number; used: boolean; selfHarm: boolean; goalCheck: string | null };
export type JournalAvg = { mood: number; craving: number; sleep: number; confidence: number };

export type JournalPicture = {
  from: string | null; // πρώτη μέρα που μετρά (null = καμία)
  to: string | null; // τελευταία μέρα που μετρά
  days: number; // μέρες που μπορούσαν να έχουν εγγραφή
  written: number;
  avg: JournalAvg | null; // μόνο με ≥ minForAvg καταχωρίσεις
  avgN: number; // από πόσες καταχωρίσεις
  minForAvg: number;
  used: string[]; // μέρες «έκανα χρήση»
  selfHarm: string[]; // μέρες με σκέψεις να κάνει κακό στον εαυτό του
  topCraving: { date: string; value: number } | null; // λαχτάρα ≥ 6
  goal: { YES: number; PARTLY: number; NO: number };
  entries: JournalEntryNum[]; // μόνο αριθμοί — ποτέ κείμενα εδώ
};

/**
 * @param o.lastPossible η τελευταία μέρα που μπορεί να έχει εγγραφή (journalDate(now): σήμερα μετά την ώρα του ημερολογίου, αλλιώς χθες)
 * @param o.startDate έναρξη προγράμματος (πριν από αυτήν δεν μετρούν μέρες)
 */
export function journalPicture(entries: JournalEntryNum[], o: { from: string; to: string; lastPossible: string; startDate?: string | null; minForAvg?: number }): JournalPicture {
  const minForAvg = o.minForAvg ?? MIN_FOR_AVG;
  const from = o.startDate && o.startDate > o.from ? o.startDate : o.from;
  const to = o.lastPossible < o.to ? o.lastPossible : o.to;
  const days = from <= to ? dayCount(from, to) : 0;
  const inRange = days ? entries.filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  const avg = (k: keyof JournalAvg) => Math.round((inRange.reduce((a, e) => a + e[k], 0) / inRange.length) * 10) / 10;
  const goal = { YES: 0, PARTLY: 0, NO: 0 };
  for (const e of inRange) if (e.goalCheck === "YES" || e.goalCheck === "PARTLY" || e.goalCheck === "NO") goal[e.goalCheck]++;
  const top = inRange.reduce<JournalEntryNum | null>((a, b) => (!a || b.craving > a.craving ? b : a), null);
  return {
    from: days ? from : null,
    to: days ? to : null,
    days,
    written: inRange.length,
    avg: inRange.length >= minForAvg ? { mood: avg("mood"), craving: avg("craving"), sleep: avg("sleep"), confidence: avg("confidence") } : null,
    avgN: inRange.length,
    minForAvg,
    used: inRange.filter((e) => e.used).map((e) => e.date),
    selfHarm: inRange.filter((e) => e.selfHarm).map((e) => e.date),
    topCraving: top && top.craving >= 6 ? { date: top.date, value: top.craving } : null,
    goal,
    entries: inRange,
  };
}

export type SoberInfo = { since: string | null; days: number | null; setBy: string | null; setAt: Date | null; setWhy: string | null; previous: string | null };

export type MemberPicture = { period: Period; sessions: SessionPicture; groups: GroupPicture; journal: JournalPicture; sober: SoberInfo };

/* ───────── Κείμενα: ΜΟΝΟ από το αντικείμενο ───────── */

const one = (k: number, a: string, b: string) => `${k} ${k === 1 ? a : b}`;
export const num = (v: number) => String(v).replace(".", ",");

/** «2 παρουσίες / 3 που πέρασαν · 1 «Δεν ήρθε» · 1 χωρίς καταγραφή (εκκρεμεί) · 1 ακυρώθηκε · 1 μεταφέρθηκε» */
export function describeSessions(p: SessionPicture): string {
  const parts: string[] = [];
  if (p.passed === 0) parts.push(p.scheduled > 0 ? "καμία δεν έχει περάσει ακόμα" : "καμία προγραμματισμένη");
  else parts.push(`${one(p.present, "παρουσία", "παρουσίες")} / ${one(p.passed, "που πέρασε", "που πέρασαν")}`);
  if (p.absent) parts.push(`${p.absent} «Δεν ήρθε»`);
  if (p.noRecord) parts.push(`${p.noRecord} χωρίς καταγραφή (εκκρεμεί)`);
  if (p.inProgress) parts.push(`${p.inProgress} σε εξέλιξη`);
  if (p.upcoming) parts.push(one(p.upcoming, "επόμενη", "επόμενες"));
  if (p.cancelled) parts.push(one(p.cancelled, "ακυρώθηκε", "ακυρώθηκαν"));
  if (p.moved) parts.push(one(p.moved, "μεταφέρθηκε", "μεταφέρθηκαν"));
  return parts.join(" · ");
}

/** «Στόχος μήνα 8 · προγραμματισμένες 6 (5 πέρασαν, 1 επόμενη)» — ή χωρίς στόχο στην εβδομάδα. */
export function describeScheduled(p: SessionPicture): string {
  const inner = [`${p.passed} ${p.passed === 1 ? "πέρασε" : "πέρασαν"}`];
  if (p.inProgress) inner.push(`${p.inProgress} σε εξέλιξη`);
  if (p.upcoming) inner.push(one(p.upcoming, "επόμενη", "επόμενες"));
  const sched = `προγραμματισμένες ${p.scheduled}${p.scheduled ? ` (${inner.join(", ")})` : ""}`;
  if (p.target === null) return sched;
  const over = p.scheduled > p.target ? " — περισσότερες από τον στόχο" : "";
  return `Στόχος μήνα ${p.target} · ${sched}${over}`;
}

/** Πηγή των παρουσιών: «1 με επιβεβαίωση θεραπευτή · 1 από σύνδεση». */
export function describeSessionSources(p: SessionPicture): string {
  const parts: string[] = [];
  if (p.presentConfirmed) parts.push(`${p.presentConfirmed} με επιβεβαίωση θεραπευτή`);
  if (p.presentJoin) parts.push(`${p.presentJoin} από σύνδεση`);
  return parts.join(" · ");
}

/** «60% (3 από 5 που πέρασαν · 1 χωρίς καταγραφή μετρά στον παρονομαστή)» — ή "" όταν δεν πέρασε καμία. */
export function describePct(p: { pct: number | null; present: number; passed: number; noRecord: number }): string {
  if (p.pct === null) return "";
  const nr = p.noRecord ? ` · ${p.noRecord} χωρίς καταγραφή ${p.noRecord === 1 ? "μετρά" : "μετρούν"} στον παρονομαστή` : "";
  return `${p.pct}% (${p.present} από ${p.passed} που ${p.passed === 1 ? "πέρασε" : "πέρασαν"}${nr})`;
}

/** «3 παρουσίες / 4 που πέρασαν · 1 χωρίς καταγραφή (εκκρεμεί) · 1 δεν έγινε · 1 επόμενη» */
export function describeGroupPicture(p: GroupPicture): string {
  const parts: string[] = [];
  if (p.passed === 0) parts.push(p.scheduled > 0 ? "καμία δεν έχει περάσει ακόμα" : "καμία στο πρόγραμμα");
  else parts.push(`${one(p.present, "παρουσία", "παρουσίες")} / ${one(p.passed, "που πέρασε", "που πέρασαν")}`);
  if (p.noRecord) parts.push(`${p.noRecord} χωρίς καταγραφή (εκκρεμεί)`);
  if (p.notHeld) parts.push(`${p.notHeld} δεν ${p.notHeld === 1 ? "έγινε" : "έγιναν"}`);
  if (p.upcoming) parts.push(one(p.upcoming, "επόμενη", "επόμενες"));
  return parts.join(" · ");
}

/** «Στόχος μήνα 16 · στο πρόγραμμα ως σήμερα 13 (11 πέρασαν, 1 δεν έγινε, 1 επόμενη)» */
export function describeGroupScheduled(p: GroupPicture): string {
  const inner = [`${p.passed} ${p.passed === 1 ? "πέρασε" : "πέρασαν"}`];
  if (p.notHeld) inner.push(`${p.notHeld} δεν ${p.notHeld === 1 ? "έγινε" : "έγιναν"}`);
  if (p.upcoming) inner.push(one(p.upcoming, "επόμενη", "επόμενες"));
  const sched = `στο πρόγραμμα ${p.target !== null ? "ως σήμερα " : ""}${p.scheduled}${p.scheduled ? ` (${inner.join(", ")})` : ""}`;
  if (p.target === null) return sched;
  const over = p.scheduled - p.notHeld > p.target ? " — περισσότερες από τον στόχο" : "";
  return `Στόχος μήνα ${p.target} · ${sched}${over}`;
}

/** «Καταχωρίσεις: 4 από 7 ημέρες (5/10–11/10)» */
export const shortDate = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;

export function describeJournal(j: JournalPicture, fmt: (d: string) => string = shortDate): string {
  if (j.days === 0) return "Καταχωρίσεις: καμία μέρα δεν μπορεί να μετρήσει ακόμα";
  const span = j.from === j.to ? fmt(j.from!) : `${fmt(j.from!)}–${fmt(j.to!)}`;
  return `Καταχωρίσεις: ${j.written} από ${one(j.days, "ημέρα", "ημέρες")} (${span})`;
}

/** «λαχτάρα 3,5 /10 · ύπνος 6,8 ώρες · διάθεση 6 /10 · σιγουριά 7 /10 (από 4 καταχωρίσεις)» ή γιατί δεν βγαίνει. */
export function describeJournalAvg(j: JournalPicture): string {
  if (!j.avg) return j.written === 0 ? "χωρίς καταχωρίσεις" : `${one(j.written, "καταχώριση", "καταχωρίσεις")}, λίγες για μέσο όρο (χρειάζονται ${j.minForAvg})`;
  return `λαχτάρα ${num(j.avg.craving)} /10 · ύπνος ${num(j.avg.sleep)} ώρες · διάθεση ${num(j.avg.mood)} /10 · σιγουριά ${num(j.avg.confidence)} /10 (από ${one(j.avgN, "καταχώριση", "καταχωρίσεις")})`;
}

/* ───────── Έλεγχοι: οι ταυτότητες που δεν επιτρέπεται να σπάσουν ───────── */

export function checkPicture(m: { sessions: SessionPicture; groups: GroupPicture; journal: JournalPicture }): string[] {
  const bad: string[] = [];
  const s = m.sessions, g = m.groups, j = m.journal;
  if (s.passed !== s.present + s.absent + s.noRecord) bad.push("ατομικές: πέρασαν ≠ παρουσίες + «Δεν ήρθε» + χωρίς καταγραφή");
  if (s.present !== s.presentConfirmed + s.presentJoin) bad.push("ατομικές: παρουσίες ≠ επιβεβαίωση + σύνδεση");
  if (s.scheduled !== s.passed + s.inProgress + s.upcoming) bad.push("ατομικές: προγραμματισμένες ≠ πέρασαν + σε εξέλιξη + επόμενες");
  if (s.scheduled !== s.items.length) bad.push("ατομικές: προγραμματισμένες ≠ γραμμές");
  if (s.cancelled !== s.cancelledItems.length || s.moved !== s.movedItems.length) bad.push("ατομικές: ακυρώσεις/μεταφορές ≠ γραμμές");
  if (s.pct !== pct(s.present, s.passed)) bad.push("ατομικές: ποσοστό ≠ παρουσίες / πέρασαν");
  if (g.passed !== g.present + g.noRecord) bad.push("ομάδες: πέρασαν ≠ παρουσίες + χωρίς καταγραφή");
  if (g.scheduled !== g.passed + g.upcoming + g.notHeld) bad.push("ομάδες: στο πρόγραμμα ≠ πέρασαν + επόμενες + δεν έγιναν");
  if (g.items.some((r) => r.state === "before_join")) bad.push("ομάδες: γραμμή πριν την ένταξη");
  if (g.pct !== pct(g.present, g.passed)) bad.push("ομάδες: ποσοστό ≠ παρουσίες / πέρασαν");
  if (j.written > j.days) bad.push("ημερολόγιο: καταχωρίσεις > μέρες");
  if (j.written !== j.entries.length) bad.push("ημερολόγιο: καταχωρίσεις ≠ γραμμές");
  if ((j.avg !== null) !== (j.written >= j.minForAvg)) bad.push("ημερολόγιο: μέσος όρος χωρίς αρκετές καταχωρίσεις");
  if (j.avg && j.avgN !== j.written) bad.push("ημερολόγιο: πλήθος μέσου όρου ≠ καταχωρίσεις");
  return bad;
}

/** Οι αριθμοί μέσα σε ένα κείμενο (για τη δοκιμή που βεβαιώνει ότι το κείμενο λέει ό,τι λένε τα πεδία). */
export const numbersIn = (text: string): number[] => (text.match(/\d+(?:,\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/* ───────── βοηθητικά ───────── */

export function pct(a: number, b: number): number | null {
  return b === 0 ? null : Math.round((a / b) * 100);
}

function dayCount(from: string, to: string): number {
  const d = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86_400_000) + 1;
}

/** Η λέξη κατάστασης μιας ατομικής στη λίστα (ίδια με PRESENCE_LABEL, συν «εκκρεμεί»). */
export const SESSION_WORD: Record<Presence, string> = {
  future: "επόμενη",
  in_progress: "σε εξέλιξη",
  present_confirmed: "παρουσία · επιβεβαίωση θεραπευτή",
  present_join: "παρουσία · από σύνδεση",
  absent_confirmed: "«Δεν ήρθε» · επιβεβαίωση θεραπευτή",
  no_record: "χωρίς καταγραφή · εκκρεμεί",
};
