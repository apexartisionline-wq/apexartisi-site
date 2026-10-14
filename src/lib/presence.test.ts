import { describe, expect, it } from "vitest";
import { bookingCame, countPresence, countsAsCame, describeCounts, describeSources, periodLabel, sessionPresence } from "./presence";
import { describeGroups, memberGroups, type Occurrence } from "./group-presence";

const t = (h: number, m = 0, d = 13) => new Date(Date.UTC(2026, 9, d, h, m));
const base = { startsAt: t(15), endsAt: t(15, 50) };

describe("παρουσία σε ατομική (απόφαση 13/10)", () => {
  it("το πάτημα «Μπες» του μέλους μετράει ως παρουσία πριν από το σημείωμα, με πηγή «Από σύνδεση»", () => {
    expect(sessionPresence({ ...base, now: t(15, 5), joinedAt: t(15, 2), confirmedCame: null })).toBe("present_join");
    expect(sessionPresence({ ...base, now: t(17), joinedAt: t(15, 2), confirmedCame: null })).toBe("present_join");
    expect(countsAsCame("present_join")).toBe(true);
  });
  it("η επιβεβαίωση του θεραπευτή υπερισχύει του πατήματος", () => {
    expect(sessionPresence({ ...base, now: t(17), joinedAt: t(15, 2), confirmedCame: false })).toBe("absent_confirmed");
    expect(sessionPresence({ ...base, now: t(17), joinedAt: null, confirmedCame: true })).toBe("present_confirmed");
    expect(bookingCame({ joinedAt: t(15, 2), confirmedCame: false })).toBe(false);
    expect(bookingCame({ joinedAt: null, confirmedCame: true })).toBe(true);
    expect(bookingCame({ joinedAt: t(15, 2), confirmedCame: null })).toBe(true);
  });
  it("χωρίς πάτημα ή επιβεβαίωση: «χωρίς καταγραφή», όχι απουσία", () => {
    expect(sessionPresence({ ...base, now: t(17), joinedAt: null, confirmedCame: null })).toBe("no_record");
    expect(countsAsCame("no_record")).toBe(false);
  });
  it("μελλοντική και σε εξέλιξη χωρίς καταγραφή δεν μπαίνουν στον παρονομαστή", () => {
    expect(sessionPresence({ ...base, now: t(14), joinedAt: null, confirmedCame: undefined })).toBe("future");
    expect(sessionPresence({ ...base, now: t(15, 20), joinedAt: null, confirmedCame: null })).toBe("in_progress");
  });
  it("μετρητές και διατύπωση «Χ παρουσίες / Υ προγραμματισμένες που πέρασαν · Ζ χωρίς καταγραφή»", () => {
    const c = countPresence(["present_confirmed", "present_join", "present_join", "absent_confirmed", "no_record", "no_record", "future"]);
    expect(c).toMatchObject({ scheduled: 7, timePassed: 6, upcoming: 1, confirmedPresent: 1, joinClicked: 2, confirmedAbsent: 1, noRecord: 2, counted: 3 });
    expect(describeCounts(c)).toBe("3 παρουσίες / 6 προγραμματισμένες που πέρασαν · 2 χωρίς καταγραφή · 1 «Δεν ήρθε» (επιβεβαίωση)");
    expect(describeSources(c)).toBe("1 με επιβεβαίωση θεραπευτή · 2 από σύνδεση");
  });
  it("ανοιχτός κύκλος: «Από 13/10 — σε εξέλιξη»", () => {
    expect(periodLabel("13/10", "13/10", true)).toBe("Από 13/10 — σε εξέλιξη");
    expect(periodLabel("7/9", "12/10", false)).toBe("7/9 – 12/10");
  });
});

describe("ομάδες ανά μέλος: πραγματικό πρόγραμμα", () => {
  const g = (d: number, h: number): Occurrence => ({ date: `2026-10-${String(d).padStart(2, "0")}`, time: `${h}:00`, startsAt: t(h, 0, d), endsAt: t(h + 1, 30, d) });
  const occ = [g(5, 17), g(6, 17), g(8, 17), g(9, 17), g(13, 17)];
  const now = t(12, 0, 13);
  it("μπαίνει στον παρονομαστή όταν έληξε και είναι μετά την ένταξη — και χωρίς καταγραφή", () => {
    const r = memberGroups(occ, [{ date: "2026-10-06", joinedAt: t(17, 3, 6) }, { date: "2026-10-09", joinedAt: t(17, 1, 9) }], { now, joinDate: "2026-10-06" });
    expect(r.rows.map((x) => x.state)).toEqual(["before_join", "present", "no_record", "present", "future"]);
    expect(r).toMatchObject({ counted: 2, noRecord: 1, passed: 3, upcoming: 1 });
    expect(describeGroups(r)).toBe("2 παρουσίες / 3 προγραμματισμένες που πέρασαν · 1 χωρίς καταγραφή");
  });
  it("δεν δημιουργεί ομάδα από «συνήθη μέρα»: παρουσία σε μέρα χωρίς ομάδα στο πρόγραμμα δεν μετράει", () => {
    const r = memberGroups(occ, [{ date: "2026-10-10", joinedAt: t(17, 0, 10) }, { date: "2026-10-07", joinedAt: t(17, 0, 7) }], { now, joinDate: null });
    expect(r.counted).toBe(0);
    expect(r.passed).toBe(4);
  });
  it("δύο ομάδες την ίδια μέρα: η παρουσία πάει σε αυτή που ταιριάζει στην ώρα", () => {
    const two = [g(8, 10), g(8, 18)];
    const r = memberGroups(two, [{ date: "2026-10-08", joinedAt: t(18, 5, 8) }], { now, joinDate: null });
    expect(r.rows.map((x) => x.state)).toEqual(["no_record", "present"]);
  });
});

describe("ομάδα «δεν έγινε» (απόφαση 14/10)", () => {
  it("βγαίνει από τον παρονομαστή όλων, ακόμη κι αν κάποιος πάτησε «Μπες»", async () => {
    const { memberGroups } = await import("./group-presence");
    const occ = [
      { date: "2026-10-05", time: "21:00", startsAt: new Date("2026-10-05T18:00:00Z"), endsAt: new Date("2026-10-05T19:30:00Z"), notHeld: true },
      { date: "2026-10-06", time: "21:00", startsAt: new Date("2026-10-06T18:00:00Z"), endsAt: new Date("2026-10-06T19:30:00Z") },
    ];
    const g = memberGroups(occ, [{ date: "2026-10-05", joinedAt: new Date("2026-10-05T18:05:00Z") }], { now: new Date("2026-10-10T00:00:00Z"), joinDate: null });
    expect(g.rows.map((r) => r.state)).toEqual(["not_held", "no_record"]);
    expect(g.passed).toBe(1);
    expect(g.counted).toBe(0);
  });
});
