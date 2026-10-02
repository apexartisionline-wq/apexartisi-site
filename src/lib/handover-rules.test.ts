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
  missed: [],
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

  it("χαμένη ατομική: κίτρινο, κόκκινο αν υπάρχει σήμα κινδύνου", () => {
    expect(safetyFlags({ ...base, missed: [{ at: ago(30), slotId: "old" }] })).toEqual([]);
    expect(safetyFlags({ ...base, missed: [{ at: ago(2), slotId: "m" }] })).toEqual([
      expect.objectContaining({ level: "yellow", text: "Δεν ήρθε στην ατομική", href: "/t/s/m" }),
    ]);
    const f = safetyFlags({ ...base, helpRequests: [{ createdAt: ago(5) }], missed: [{ at: ago(2), slotId: "m" }] });
    expect(f.map((x) => x.level)).toEqual(["red", "red"]);
    expect(f[1].text).toContain("μετά από σήμα κινδύνου");
  });

  it("χρήση «δεν ξέρουμε» μόνο αν είναι η πιο πρόσφατη απάντηση", () => {
    const unknownLast = safetyFlags({
      ...base,
      notes: [
        { at: ago(10), riskChange: "SAME", usedSince: "NO", slotId: "a" },
        { at: ago(3), riskChange: "SAME", usedSince: "UNKNOWN", slotId: "b" },
      ],
    });
    expect(unknownLast).toEqual([expect.objectContaining({ level: "yellow", href: "/t/s/b" })]);
    const answeredLater = safetyFlags({
      ...base,
      notes: [
        { at: ago(10), riskChange: "SAME", usedSince: "UNKNOWN", slotId: "a" },
        { at: ago(3), riskChange: "SAME", usedSince: "NO", slotId: "b" },
      ],
    });
    expect(answeredLater).toEqual([]);
  });

  it("νέο μέλος χωρίς πλάνο: κανένα σήμα πριν ολοκληρωθεί η έναρξη", () => {
    expect(safetyFlags({ ...base, risk: null, safetyPlanAt: null, intakeComplete: false })).toEqual([]);
  });

  it("το κόκκινο κουμπί μπαίνει πρώτο, ακόμα κι αν άλλο σήμα είναι πιο πρόσφατο", () => {
    const f = safetyFlags({
      ...base,
      helpRequests: [{ createdAt: ago(10) }],
      notes: [{ at: ago(2), riskChange: "UP", usedSince: "NO", slotId: "s" }],
    });
    expect(f[0].text).toContain("Κόκκινο κουμπί");
  });

  it("αξιολόγηση αναγκών: αυξημένες = κίτρινο, παλιά (>30 μέρες) = κίτρινο", () => {
    expect(safetyFlags({ ...base, risk: { value: "MEDIUM", at: ago(5) } })).toEqual([
      expect.objectContaining({ level: "yellow", text: "Αυξημένες ανάγκες ασφάλειας" }),
    ]);
    expect(safetyFlags({ ...base, risk: { value: "LOW", at: ago(45) } })[0].text).toContain("45 μέρες");
  });

  it("με υψηλές ανάγκες το πλάνο ασφάλειας θέλει αναθεώρηση κάθε 4 εβδομάδες", () => {
    const f = safetyFlags({ ...base, risk: { value: "HIGH", at: ago(2) }, safetyPlanAt: ago(35) });
    expect(f.map((x) => x.text)).toContain("Το πλάνο ασφάλειας δεν έχει αναθεωρηθεί 35 μέρες");
  });

  it("χωρίς αξιολόγηση κινδύνου μόνο μετά την έναρξη", () => {
    expect(safetyFlags({ ...base, risk: null, intakeComplete: false })).toEqual([]);
    expect(safetyFlags({ ...base, risk: null })[0].text).toBe("Δεν υπάρχει αξιολόγηση αναγκών ασφάλειας");
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
