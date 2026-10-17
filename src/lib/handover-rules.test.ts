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

  it("πλάνο ασφάλειας: κανένα σήμα «δεν υπάρχει / αναθεώρηση» (μόνο όταν υπάρχει λόγος)", () => {
    const f = safetyFlags({ ...base, risk: { value: "HIGH", at: ago(3) }, safetyPlanAt: null });
    expect(f.map((x) => x.level)).toEqual(["red"]);
    expect(safetyFlags({ ...base, safetyPlanAt: null })).toEqual([]);
    expect(safetyFlags({ ...base, safetyPlanAt: ago(120) })).toEqual([]);
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

  it("σήμα «Χωρίς επαφή»: ίδιο με ή χωρίς ανοιχτό τηλεφώνημα, και μένει μετά την ολοκλήρωσή του", () => {
    expect(safetyFlags({ ...base, lastContact: ago(5) }).map((x) => x.text)).toEqual(["5 μέρες χωρίς καμία επαφή μαζί μας (ούτε ομάδα, ούτε απογραφή, ούτε ατομική)"]);
    expect(safetyFlags({ ...base, lastContact: ago(5), openDropout: true }).map((x) => x.text)).toEqual(["5 μέρες χωρίς καμία επαφή μαζί μας (ούτε ομάδα, ούτε απογραφή, ούτε ατομική)"]);
    // Η ενέργεια ολοκληρώθηκε (openDropout false) αλλά δεν υπήρξε νέα επαφή: το σήμα μένει.
    expect(safetyFlags({ ...base, lastContact: ago(6), openDropout: false })[0].text).toBe("6 μέρες χωρίς καμία επαφή μαζί μας (ούτε ομάδα, ούτε απογραφή, ούτε ατομική)");
  });

  it("έντονες επιθυμίες (17/10): λαχτάρα ≥ 6 τις τελευταίες 7 μέρες — κίτρινο, με τον μεγαλύτερο αριθμό και πόσες μέρες", () => {
    expect(safetyFlags({ ...base, cravings: [{ date: "2026-09-20", craving: 9, at: ago(12) }] })).toEqual([]);
    expect(safetyFlags({ ...base, cravings: [{ date: "2026-10-01", craving: 5, at: ago(1) }] })).toEqual([]);
    const one = safetyFlags({ ...base, cravings: [{ date: "2026-10-01", craving: 7, at: ago(1) }] });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ level: "yellow", key: "craving" });
    expect(one[0].text).toBe("Έντονες επιθυμίες στο ημερολόγιο: λαχτάρα 7/10 στις 1/10 — ρώτα το στην επόμενη επαφή");
    const two = safetyFlags({ ...base, cravings: [{ date: "2026-10-01", craving: 6, at: ago(1) }, { date: "2026-09-29", craving: 8, at: ago(3) }] });
    expect(two[0].text).toBe("Έντονες επιθυμίες στο ημερολόγιο: λαχτάρα 8/10 στις 29/9 · 2 μέρες τις τελευταίες 7 — ρώτα το στην επόμενη επαφή");
  });

  it("νέο μέλος (17/10): κίτρινο τις πρώτες 14 μέρες από την έναρξη, μετά τίποτα", () => {
    expect(safetyFlags({ ...base, programStart: ago(20) })).toEqual([]);
    expect(safetyFlags({ ...base, programStart: ago(0) })[0].text).toContain("ξεκίνησε σήμερα");
    const f = safetyFlags({ ...base, programStart: ago(3) });
    expect(f[0]).toMatchObject({ level: "yellow", key: "new_member" });
    expect(f[0].text).toBe("Νέο μέλος — ξεκίνησε πριν 3 μέρες: τις πρώτες 14 μέρες παραπάνω φροντίδα και παρακολούθηση");
    expect(safetyFlags({ ...base, programStart: ago(13) })).toHaveLength(1);
    expect(safetyFlags({ ...base, programStart: ago(15) })).toEqual([]);
    expect(safetyFlags({ ...base, lastContact: ago(1), openDropout: false })).toEqual([]);
  });

  it("χαμένη ατομική: κίτρινο, κόκκινο αν υπάρχει σήμα ασφάλειας", () => {
    expect(safetyFlags({ ...base, missed: [{ at: ago(30), slotId: "old" }] })).toEqual([]);
    expect(safetyFlags({ ...base, missed: [{ at: ago(2), slotId: "m" }] })).toEqual([
      expect.objectContaining({ level: "yellow", text: "Χωρίς καταγραφή παρουσίας στην ατομική", href: "/t/s/m" }),
    ]);
    const f = safetyFlags({ ...base, helpRequests: [{ createdAt: ago(5) }], missed: [{ at: ago(2), slotId: "m" }] });
    expect(f.map((x) => x.level)).toEqual(["red", "red"]);
    expect(f[1].text).toContain("μετά από σήμα ασφάλειας");
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
    expect(f[0].text).toContain("κόκκινο κουμπί");
  });

  it("αξιολόγηση αναγκών: αυξημένες = κίτρινο· παλιά αξιολόγηση δεν βγάζει σήμα (μόνο όταν υπάρχει λόγος)", () => {
    expect(safetyFlags({ ...base, risk: { value: "MEDIUM", at: ago(5) } })).toEqual([
      expect.objectContaining({ level: "yellow", text: "Αυξημένες ανάγκες ασφάλειας" }),
    ]);
    expect(safetyFlags({ ...base, risk: { value: "LOW", at: ago(45) } })).toEqual([]);
  });

  it("χωρίς αξιολόγηση αναγκών ασφάλειας: κανένα σήμα (γίνεται μόνο όταν υπάρχει λόγος)", () => {
    expect(safetyFlags({ ...base, risk: null })).toEqual([]);
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
  it("βρίσκει και άλλες καταλήξεις της λέξης", () => {
    const p = { ...n, text: "Ντροπή μετά τον καβγά με τον πατέρα του" };
    expect(matchNote(p, { q: "πατερας" })).toBe(true);
    expect(matchNote(p, { q: "Πατέρες" })).toBe(true);
    expect(matchNote(p, { q: "ντροπη πατερα" })).toBe(true);
    expect(matchNote(p, { q: "μητέρα" })).toBe(false);
  });
});

describe("προέλευση της ένδειξης «δεν ήρθε»", () => {
  it("με σημείωμα «Δεν ήρθε» το λέει· χωρίς σημείωμα λέει ότι λείπει καταγραφή", () => {
    const f = safetyFlags({ ...base, missed: [{ at: new Date(Date.now() - 2 * 86_400_000), slotId: "m", noted: true }] });
    expect(f[0].text).toBe("Δεν ήρθε στην ατομική (επιβεβαίωση θεραπευτή)");
  });
});
