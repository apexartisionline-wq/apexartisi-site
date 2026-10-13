import { describe, expect, it } from "vitest";
import { countPresence, countsAsCame, describeCounts, periodLabel, sessionPresence } from "./presence";

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 13, h, m));
const base = { startsAt: t(15), endsAt: t(15, 50) };

describe("παρουσία σε ατομική", () => {
  it("η έλλειψη καταγραφής δεν είναι επιβεβαιωμένη απουσία", () => {
    expect(sessionPresence({ ...base, now: t(17), joinedAt: null, hasNote: false })).toBe("no_record");
    expect(sessionPresence({ ...base, now: t(17), joinedAt: null, hasNote: true })).toBe("absent_note");
  });
  it("πάτημα «Μπες» χωρίς σημείωμα δεν είναι επιβεβαίωση· με σημείωμα «Ήρθε» είναι", () => {
    expect(sessionPresence({ ...base, now: t(17), joinedAt: t(15, 2), hasNote: false })).toBe("join_clicked");
    expect(sessionPresence({ ...base, now: t(17), joinedAt: t(15), hasNote: true })).toBe("present_note");
  });
  it("μελλοντική και σε εξέλιξη δεν μετράνε ως καταγραφή ή απουσία", () => {
    expect(sessionPresence({ ...base, now: t(14), joinedAt: null, hasNote: false })).toBe("future");
    expect(sessionPresence({ ...base, now: t(15, 20), joinedAt: null, hasNote: false })).toBe("in_progress");
  });
  it("ο υπάρχων κανόνας μέτρησης μένει: ήρθε = επιβεβαιωμένη ή πάτησε «Μπες»", () => {
    expect(countsAsCame("present_note")).toBe(true);
    expect(countsAsCame("join_clicked")).toBe(true);
    expect(countsAsCame("no_record")).toBe(false);
    expect(countsAsCame("absent_note")).toBe(false);
  });
  it("οι μετρητές ξεχωρίζουν τις έννοιες και δεν χρησιμοποιούν «έγιναν» για όλες", () => {
    const c = countPresence(["present_note", "join_clicked", "absent_note", "no_record", "no_record", "future"]);
    expect(c).toMatchObject({ scheduled: 6, timePassed: 5, upcoming: 1, confirmedPresent: 1, joinClicked: 1, confirmedAbsent: 1, noRecord: 2, counted: 2 });
    expect(describeCounts(c)).toBe("1 με σημείωμα «Ήρθε» · 1 πάτησε «Μπες» χωρίς σημείωμα · 1 σημείωμα «Δεν ήρθε» · 2 χωρίς καταγραφή");
  });
  it("ανοιχτός κύκλος: «Από 13/10 — σε εξέλιξη»", () => {
    expect(periodLabel("13/10", "13/10", true)).toBe("Από 13/10 — σε εξέλιξη");
    expect(periodLabel("7/9", "12/10", false)).toBe("7/9 – 12/10");
  });
});
