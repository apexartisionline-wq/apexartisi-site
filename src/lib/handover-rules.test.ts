import { describe, expect, it } from "vitest";
import { matchNote, safetyFlags, type SafetyInput } from "./handover-rules";

const now = new Date("2026-10-02T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 24 * 3600_000);
const base: SafetyInput = {
  now,
  risk: { value: "LOW", at: ago(20) },
  safetyPlanAt: ago(10),
  helpRequests: [],
  notes: [],
  lastContact: ago(1),
  openDropout: false,
  dropoutDays: 3,
  intakeComplete: true,
};

describe("safetyFlags", () => {
  it("τίποτα όταν όλα είναι εντάξει", () => {
    expect(safetyFlags(base)).toEqual([]);
  });

  it("κόκκινο κουμπί μόνο τις τελευταίες 14 μέρες", () => {
    expect(safetyFlags({ ...base, helpRequests: [{ createdAt: ago(20) }] })).toEqual([]);
    const f = safetyFlags({ ...base, helpRequests: [{ createdAt: ago(2) }, { createdAt: ago(5) }] });
    expect(f[0]).toMatchObject({ level: "red", at: ago(2) });
    expect(f[0].text).toContain("2 φορές");
  });

  it("υψηλός κίνδυνος χωρίς πλάνο ασφάλειας: δύο κόκκινα", () => {
    const f = safetyFlags({ ...base, risk: { value: "HIGH", at: ago(3) }, safetyPlanAt: null });
    expect(f.map((x) => x.level)).toEqual(["red", "red"]);
  });

  it("χωρίς πλάνο με χαμηλό κίνδυνο: κίτρινο", () => {
    expect(safetyFlags({ ...base, safetyPlanAt: null })).toEqual([expect.objectContaining({ level: "yellow", href: "safety" })]);
  });

  it("παλιό πλάνο ασφάλειας", () => {
    expect(safetyFlags({ ...base, safetyPlanAt: ago(120) })[0].text).toContain("120 μέρες");
  });

  it("σημειώματα: αύξηση κινδύνου και χρήση μέσα σε 30 μέρες, με σύνδεσμο", () => {
    const f = safetyFlags({
      ...base,
      notes: [
        { at: ago(40), riskChange: "UP", usedSince: "YES", slotId: "old" },
        { at: ago(4), riskChange: "SAME", usedSince: "YES", slotId: "s1" },
      ],
    });
    expect(f).toEqual([expect.objectContaining({ level: "red", href: "/t/s/s1", text: expect.stringContaining("χρήση") })]);
  });

  it("σιωπή μετά από dropoutDays, αλλά όχι διπλό με ανοιχτό τηλεφώνημα", () => {
    expect(safetyFlags({ ...base, lastContact: ago(5) })[0].text).toBe("Χωρίς επαφή 5 μέρες");
    const f = safetyFlags({ ...base, lastContact: ago(5), openDropout: true });
    expect(f.map((x) => x.text)).toEqual(["Εκκρεμεί τηλεφώνημα (χωρίς επαφή)"]);
  });

  it("χωρίς αξιολόγηση κινδύνου μόνο μετά την έναρξη", () => {
    expect(safetyFlags({ ...base, risk: null, intakeComplete: false })).toEqual([]);
    expect(safetyFlags({ ...base, risk: null })[0].text).toBe("Δεν υπάρχει αξιολόγηση κινδύνου");
  });
});

describe("matchNote", () => {
  const n = { therapistId: "a", date: "2026-09-20", text: "Μίλησε για τη ΔΟΥΛΕΙΆ και το άγχος", riskChange: "UP", usedSince: "NO" };
  it("φίλτρα θεραπευτή, ημερομηνιών και σημαιών", () => {
    expect(matchNote(n, {})).toBe(true);
    expect(matchNote(n, { therapistId: "b" })).toBe(false);
    expect(matchNote(n, { from: "2026-09-21" })).toBe(false);
    expect(matchNote(n, { to: "2026-09-19" })).toBe(false);
    expect(matchNote(n, { risk: true })).toBe(true);
    expect(matchNote(n, { used: true })).toBe(false);
  });
  it("αναζήτηση χωρίς τόνους και κεφαλαία", () => {
    expect(matchNote(n, { q: "δουλεια" })).toBe(true);
    expect(matchNote(n, { q: "οικογένεια" })).toBe(false);
  });
});
