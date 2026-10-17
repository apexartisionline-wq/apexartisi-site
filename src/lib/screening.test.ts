import { describe, expect, it } from "vitest";
import { APEX_SCREEN, SCREEN_KEYS, screenScore, screenTitle } from "./screening";

describe("προσωρινά ερωτηματολόγια Apex", () => {
  it("10 διαφορετικές ερωτήσεις ανά περίπτωση, με δική μας διατύπωση (όχι τα κείμενα των επίσημων)", () => {
    for (const k of SCREEN_KEYS) {
      expect(APEX_SCREEN[k]).toHaveLength(10);
      expect(new Set(APEX_SCREEN[k]).size).toBe(10);
      for (const q of APEX_SCREEN[k]) expect(q).not.toMatch(/AUDIT|DAST|PGSI|ερώτηση \d/);
    }
  });
  it("βαθμολογία: άθροισμα 0–30, ενδεικτικός αριθμός χωρίς χαρακτηρισμό κινδύνου", () => {
    expect(screenScore([])).toBeNull();
    expect(screenScore(undefined)).toBeNull();
    expect(screenScore([3, 3, null, 1])).toMatchObject({ score: 7, answered: 3, of: 10, level: "plain" });
    expect(screenScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])?.score).toBe(30);
    expect(screenScore([1])?.band).toMatch(/ενδεικτικός/);
  });
  it("τίτλος λέει «προσωρινό» όσο δεν υπάρχει άδεια", () => {
    expect(screenTitle("drugs")).toMatch(/προσωρινό.*DAST-10/);
  });
});
