import { describe, expect, it } from "vitest";
import { draftMessage, themeLines } from "./monthly-message";

const pic = { sessions: { came: 7, total: 8 }, groups: { came: 3, total: 16 }, journal: { written: 20, days: 28 }, soberDays: 64, weeks: [{ text: "να μιλάω όταν ντρέπομαι", yes: 3, partly: 2 }], themes: ["Πίστη", "Παράδοση"] };

describe("μήνυμα ενθάρρυνσης", () => {
  it("συναίσθημα από ό,τι δούλεψε: θεματικές, στόχοι με τα λόγια του, παρουσία", () => {
    const t = draftMessage("Νίκος", pic, 2);
    expect(t).toContain("ο δεύτερος μήνας σου");
    expect(t).toContain("τις θεματικές «Πίστη» και «Παράδοση»");
    expect(t).toContain("Στην «Πίστη»");
    expect(t).toContain("«να μιλάω όταν ντρέπομαι»");
    expect(t).toContain("(5 μέρες)");
    expect(t).toContain("σε 3 ομάδες και 7 ατομικές");
    expect(t).toContain("64 μέρες νηφαλιότητας");
  });
  it("μόνο θετικά: ποτέ τι δεν έκανε", () => {
    expect(draftMessage("Νίκος", pic)).not.toMatch(/από 16|από 8|δεν ήρθες|μόνο \d|έλειψες/);
  });
  it("χωρίς τίποτα μετρήσιμο: μόνο ζεστό άνοιγμα και κλείσιμο", () => {
    const t = draftMessage("Ελένη", { sessions: { came: 0, total: 8 }, groups: { came: 0, total: 16 }, journal: { written: 0, days: 28 }, soberDays: null, weeks: [] });
    expect(t.split("\n\n")).toHaveLength(3);
  });
  it("φράσεις θεματικής: το πολύ 2, χωρίς επαναλήψεις", () => {
    expect(themeLines(["Πίστη: τι εμπιστεύομαι", "Πίστη: παράδοση", "Ντροπή"])).toHaveLength(2);
    expect(themeLines(["Κάτι άγνωστο"])).toEqual([]);
  });
});
