import { describe, expect, it } from "vitest";
import {
  GROUP_MISS,
  checkPicture, describeGroupPicture, describeGroupScheduled, describeJournal, describeJournalAvg, describePct, describeScheduled,
  describeSessionSources, describeSessions, groupPicture, journalPicture, numbersIn, sessionPicture, type GroupItem, type JournalEntryNum, type SessionItem,
} from "./picture";

const at = (d: string, h = 15) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
const s = (id: string, date: string, state: SessionItem["state"], pair = false): SessionItem => ({ id, date, startsAt: at(date), pair, state, joinedAt: null });
const g = (date: string, state: GroupItem["state"]): GroupItem => ({ date, time: "19:00", startsAt: at(date, 16), state });
const j = (date: string, x: Partial<JournalEntryNum> = {}): JournalEntryNum => ({ date, mood: 6, craving: 3, sleep: 7, confidence: 7, used: false, selfHarm: false, goalCheck: null, ...x });

/** Κάθε αριθμός που λέει το κείμενο πρέπει να είναι πεδίο της εικόνας (όχι «12 φορές» δίπλα σε «3/15»). */
const allowed = (o: Record<string, unknown>) => new Set(Object.values(o).filter((v): v is number => typeof v === "number"));
const textAgrees = (text: string, fields: Record<string, unknown>, extra: number[] = []) => {
  const ok = allowed(fields); extra.forEach((n) => ok.add(n));
  for (const n of numbersIn(text)) expect(ok.has(n), `ο αριθμός ${n} στο «${text}» δεν είναι πεδίο της εικόνας`).toBe(true);
};

describe("εικόνα εβδομάδας — παράδειγμα της αναφοράς (5/10–11/10)", () => {
  // Τρίτη ήρθε (επιβεβαίωση), Πέμπτη χωρίς καταγραφή, Σάββατο ακυρώθηκε από το μέλος.
  const sessions = sessionPicture(
    [s("a", "2026-10-06", "present_confirmed"), s("b", "2026-10-08", "no_record")],
    { cancelled: [{ date: "2026-10-10", startsAt: at("2026-10-10"), pair: false, at: at("2026-10-07"), by: "Νίκος", reason: "Ακύρωση από το μέλος" }] },
  );
  const groups = groupPicture([g("2026-10-05", "present"), g("2026-10-06", "present"), g("2026-10-07", "not_held"), g("2026-10-08", "no_record"), g("2026-10-09", "present")]);
  const journal = journalPicture([j("2026-10-05"), j("2026-10-06", { craving: 5 }), j("2026-10-08"), j("2026-10-11", { craving: 3, goalCheck: "YES" })], { from: "2026-10-05", to: "2026-10-11", lastPossible: "2026-10-13" });

  it("ατομικές: 1 παρουσία / 2 που πέρασαν · 1 χωρίς καταγραφή · 1 ακυρώθηκε (εκτός κλασμάτων)", () => {
    expect(sessions).toMatchObject({ scheduled: 2, passed: 2, present: 1, presentConfirmed: 1, presentJoin: 0, absent: 0, noRecord: 1, upcoming: 0, cancelled: 1, moved: 0, pct: 50 });
    expect(describeSessions(sessions)).toBe("1 παρουσία / 2 που πέρασαν · 1 χωρίς καταγραφή (εκκρεμεί) · 1 ακυρώθηκε");
    expect(describePct(sessions)).toBe("50% (1 από 2 που πέρασαν · 1 χωρίς καταγραφή μετρά στον παρονομαστή)");
    expect(describeScheduled(sessions)).toBe("προγραμματισμένες 2 (2 πέρασαν)");
    expect(describeSessionSources(sessions)).toBe("1 με επιβεβαίωση θεραπευτή");
  });
  it("ομάδες: 3 παρουσίες / 4 που πέρασαν · 1 χωρίς καταγραφή · 1 δεν έγινε", () => {
    expect(groups).toMatchObject({ scheduled: 5, passed: 4, present: 3, noRecord: 1, notHeld: 1, upcoming: 0, pct: 75 });
    expect(describeGroupPicture(groups)).toBe("3 παρουσίες / 4 που πέρασαν · 1 «Δεν ήρθε» (δεν πάτησε «Μπες») · 1 δεν έγινε");
    expect(describePct(groups, GROUP_MISS)).toBe("75% (3 από 4 που πέρασαν · 1 «Δεν ήρθε» μετρά στον παρονομαστή)");
    expect(describeGroupScheduled(groups)).toBe("στο πρόγραμμα 5 (4 πέρασαν, 1 δεν έγινε)");
  });
  it("ημερολόγιο: 4 από 7 ημέρες, μέσοι όροι από 4 καταχωρίσεις", () => {
    expect(journal).toMatchObject({ days: 7, written: 4, avgN: 4, from: "2026-10-05", to: "2026-10-11" });
    expect(describeJournal(journal)).toBe("Καταχωρίσεις: 4 από 7 ημέρες (5/10–11/10)");
    expect(journal.avg).toEqual({ mood: 6, craving: 3.5, sleep: 7, confidence: 7 });
    expect(describeJournalAvg(journal)).toBe("λαχτάρα 3,5 /10 · ύπνος 7 ώρες · διάθεση 6 /10 · σιγουριά 7 /10 (από 4 καταχωρίσεις)");
    expect(journal.goal).toEqual({ YES: 1, PARTLY: 0, NO: 0 });
  });
  it("οι ταυτότητες ισχύουν και τα κείμενα λένε μόνο αριθμούς της εικόνας", () => {
    expect(checkPicture({ sessions, groups, journal })).toEqual([]);
    textAgrees(describeSessions(sessions), sessions);
    textAgrees(describePct(sessions), sessions);
    textAgrees(describeGroupPicture(groups), groups);
    textAgrees(describeJournal(journal), journal, [5, 10, 11]); // οι ημερομηνίες
  });
});

describe("εικόνα μήνα (κύκλος) — παράδειγμα της αναφοράς", () => {
  const sessions = sessionPicture(
    [
      s("1", "2026-09-28", "present_confirmed"), s("2", "2026-10-01", "absent_confirmed"), s("3", "2026-10-06", "present_confirmed"),
      s("4", "2026-10-08", "no_record"), s("5", "2026-10-13", "present_join"), s("6", "2026-10-16", "future"),
    ],
    { target: 8, cancelled: [{ date: "2026-10-10", startsAt: at("2026-10-10"), pair: false, at: at("2026-10-07"), by: "Νίκος", reason: "" }] },
  );
  const groupRows: GroupItem[] = [];
  for (const d of ["09-28", "09-29", "09-30", "10-01", "10-02", "10-05", "10-06", "10-07", "10-08", "10-09", "10-12", "10-13", "10-14"]) groupRows.push(g(`2026-${d}`, "no_record"));
  for (const i of [0, 1, 2, 4, 5, 6, 9, 11]) groupRows[i] = { ...groupRows[i], state: "present" };
  groupRows[7] = { ...groupRows[7], state: "not_held" }; // 7/10
  groupRows[12] = { ...groupRows[12], state: "future" }; // απόψε
  groupRows.push(g("2026-09-20", "before_join")); // δεν φαίνεται
  const groups = groupPicture(groupRows, { target: 16 });
  const journal = journalPicture(Array.from({ length: 9 }, (_, i) => j(`2026-10-${String(i + 1).padStart(2, "0")}`)), { from: "2026-09-28", to: "2026-10-14", lastPossible: "2026-10-13" });

  it("ατομικές: στόχος 8, προγραμματισμένες 6 (5 πέρασαν, 1 επόμενη), 3 παρουσίες, 1 «Δεν ήρθε», 1 χωρίς καταγραφή, 1 ακυρώθηκε", () => {
    expect(sessions).toMatchObject({ target: 8, scheduled: 6, passed: 5, present: 3, presentConfirmed: 2, presentJoin: 1, absent: 1, noRecord: 1, upcoming: 1, cancelled: 1, pct: 60 });
    expect(describeScheduled(sessions)).toBe("Στόχος μήνα 8 · προγραμματισμένες 6 (5 πέρασαν, 1 επόμενη)");
    expect(describeSessions(sessions)).toBe("3 παρουσίες / 5 που πέρασαν · 1 «Δεν ήρθε» · 1 χωρίς καταγραφή (εκκρεμεί) · 1 επόμενη · 1 ακυρώθηκε");
    expect(describeSessionSources(sessions)).toBe("2 με επιβεβαίωση θεραπευτή · 1 από σύνδεση");
    expect(describePct(sessions)).toBe("60% (3 από 5 που πέρασαν · 1 χωρίς καταγραφή μετρά στον παρονομαστή)");
  });
  it("ομάδες: στόχος 16, στο πρόγραμμα 13 (11 πέρασαν, 1 δεν έγινε, 1 επόμενη), 8 παρουσίες / 11, 3 χωρίς καταγραφή· «πριν την ένταξη» δεν φαίνεται", () => {
    expect(groups).toMatchObject({ target: 16, scheduled: 13, passed: 11, present: 8, noRecord: 3, notHeld: 1, upcoming: 1, pct: 73 });
    expect(describeGroupScheduled(groups)).toBe("Στόχος μήνα 16 · στο πρόγραμμα ως σήμερα 13 (11 πέρασαν, 1 δεν έγινε, 1 επόμενη)");
    expect(describeGroupPicture(groups)).toBe("8 παρουσίες / 11 που πέρασαν · 3 «Δεν ήρθε» (δεν πάτησε «Μπες») · 1 δεν έγινε · 1 επόμενη");
    expect(describePct(groups, GROUP_MISS)).toBe("73% (8 από 11 που πέρασαν · 3 «Δεν ήρθε» μετρούν στον παρονομαστή)");
  });
  it("ημερολόγιο: 9 από 16 ημέρες (28/9–13/10) — η σημερινή δεν μετρά πριν την ώρα του ημερολογίου", () => {
    expect(describeJournal(journal)).toBe("Καταχωρίσεις: 9 από 16 ημέρες (28/9–13/10)");
    expect(checkPicture({ sessions, groups, journal })).toEqual([]);
  });
  it("περισσότερες προγραμματισμένες από τον στόχο: το λέει", () => {
    const many = sessionPicture(Array.from({ length: 9 }, (_, i) => s(String(i), "2026-10-01", "present_confirmed")), { target: 8 });
    expect(describeScheduled(many)).toContain("περισσότερες από τον στόχο");
  });
});

describe("ειδικές περιπτώσεις", () => {
  it("μεταφορά: μετρά μόνο στη νέα ημερομηνία· στην παλιά περίοδο φαίνεται ως πληροφορία", () => {
    const old = sessionPicture([], { moved: [{ date: "2026-10-08", startsAt: at("2026-10-08"), toDate: "2026-10-15", toStartsAt: at("2026-10-15"), at: at("2026-10-07"), by: "Εύα" }] });
    expect(old).toMatchObject({ scheduled: 0, passed: 0, moved: 1, pct: null });
    expect(describeSessions(old)).toBe("καμία προγραμματισμένη · 1 μεταφέρθηκε");
    expect(describePct(old)).toBe("");
  });
  it("τίποτα δεν πέρασε ακόμα: χωρίς ποσοστό, με τις επόμενες", () => {
    const p = sessionPicture([s("x", "2026-10-20", "future"), s("y", "2026-10-14", "in_progress")]);
    expect(describeSessions(p)).toBe("καμία δεν έχει περάσει ακόμα · 1 σε εξέλιξη · 1 επόμενη");
    expect(p.pct).toBeNull();
    expect(checkPicture({ sessions: p, groups: groupPicture([]), journal: journalPicture([], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13" }) })).toEqual([]);
  });
  it("«Δεν ήρθε» υπερισχύει του πατήματος (ήδη στην κατάσταση)· η παρουσία από σύνδεση μετρά", () => {
    const p = sessionPicture([{ ...s("a", "2026-10-06", "absent_confirmed"), joinedAt: at("2026-10-06") }, s("b", "2026-10-07", "present_join")]);
    expect(p).toMatchObject({ present: 1, presentJoin: 1, absent: 1, passed: 2, pct: 50 });
  });
  it("ημερολόγιο: μέλος που ξεκίνησε μέσα στην περίοδο — μετρούν μόνο οι μέρες από την έναρξη", () => {
    const p = journalPicture([j("2026-10-12"), j("2026-10-13")], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13", startDate: "2026-10-12" });
    expect(p).toMatchObject({ days: 2, written: 2, from: "2026-10-12", to: "2026-10-13", avg: null, avgN: 2 });
    expect(describeJournal(p)).toBe("Καταχωρίσεις: 2 από 2 ημέρες (12/10–13/10)");
    expect(describeJournalAvg(p)).toBe("2 καταχωρίσεις, λίγες για μέσο όρο (χρειάζονται 3)");
  });
  it("ημερολόγιο: καμία μέρα δεν μετρά ακόμα (έναρξη αύριο) / χωρίς καταχωρίσεις", () => {
    const p = journalPicture([], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13", startDate: "2026-10-15" });
    expect(p.days).toBe(0);
    expect(describeJournal(p)).toBe("Καταχωρίσεις: καμία μέρα δεν μπορεί να μετρήσει ακόμα");
    const q = journalPicture([], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13" });
    expect(describeJournal(q)).toBe("Καταχωρίσεις: 0 από 6 ημέρες (8/10–13/10)");
    expect(describeJournalAvg(q)).toBe("χωρίς καταχωρίσεις");
  });
  it("ημερολόγιο: σήματα και πιο δυνατή λαχτάρα (μόνο αριθμοί, ποτέ κείμενο)", () => {
    const p = journalPicture([j("2026-10-10", { used: true, craving: 8 }), j("2026-10-11", { selfHarm: true })], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13" });
    expect(p.used).toEqual(["2026-10-10"]);
    expect(p.selfHarm).toEqual(["2026-10-11"]);
    expect(p.topCraving).toEqual({ date: "2026-10-10", value: 8 });
    expect(Object.keys(p.entries[0])).not.toContain("note");
  });
  it("checkPicture πιάνει εικόνα που διαφωνεί με τον εαυτό της", () => {
    const p = sessionPicture([s("a", "2026-10-06", "present_confirmed")]);
    const broken = { ...p, passed: 3 };
    expect(checkPicture({ sessions: broken, groups: groupPicture([]), journal: journalPicture([], { from: "2026-10-08", to: "2026-10-14", lastPossible: "2026-10-13" }) })).toContain("ατομικές: πέρασαν ≠ παρουσίες + «Δεν ήρθε» + χωρίς καταγραφή");
  });
});

describe("συνέπεια με τον στόχο από την κάρτα (25/10)", () => {
  it("μετρά τα πατήματα και σε μέρες χωρίς ημερολόγιο, μόνο μέσα στην περίοδο", () => {
    const p = journalPicture([j("2026-10-05")], {
      from: "2026-10-05", to: "2026-10-11", lastPossible: "2026-10-11",
      goalChecks: [{ date: "2026-10-04", check: "YES" }, { date: "2026-10-06", check: "YES" }, { date: "2026-10-07", check: "PARTLY" }, { date: "2026-10-08", check: "NO" }],
    });
    expect(p.goal).toEqual({ YES: 1, PARTLY: 1, NO: 1 });
  });
});
