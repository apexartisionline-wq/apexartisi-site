import { describe, expect, it } from "vitest";
import { draftMessage } from "./monthly-message";

describe("μήνυμα ενθάρρυνσης", () => {
  it("μόνο θετικά: λέει τι έκανε, όχι τι δεν έκανε", () => {
    const t = draftMessage("Νίκος", { sessions: { came: 7, total: 8 }, groups: { came: 3, total: 16 }, journal: { written: 20, days: 28 }, soberDays: 64, weeks: [{ text: "να μιλάω όταν ντρέπομαι", yes: 3, partly: 2 }] });
    expect(t).toContain("ήρθες σε 3 ομάδες, έκανες 7 ατομικές και έγραψες απογραφές 20 βράδια");
    expect(t).toContain("5 μέρες");
    expect(t).toContain("64 μέρες νηφάλιος/α");
    expect(t).not.toMatch(/από 16|δεν ήρθες|μόνο/);
  });
  it("χωρίς τίποτα μετρήσιμο: μόνο ζεστό κλείσιμο", () => {
    const t = draftMessage("Ελένη", { sessions: { came: 0, total: 8 }, groups: { came: 0, total: 16 }, journal: { written: 0, days: 28 }, soberDays: null, weeks: [] });
    expect(t.split("\n\n")).toHaveLength(3);
    expect(t).toContain("Συνεχίζουμε μαζί");
  });
});
