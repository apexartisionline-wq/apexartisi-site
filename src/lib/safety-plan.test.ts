import { describe, expect, it } from "vitest";
import { HELPERS_LABEL, hasPlanContent, lastDiscussed, lastReviewAt, missingSections, PLAN_FIELDS, PLAN_ORDER } from "./safety-plan";

describe("το πλάνο όταν δυσκολεύομαι", () => {
  it("7 ερωτήσεις: 5 πεδία + η λίστα ανθρώπων, με τη σειρά του μέλους", () => {
    expect(PLAN_ORDER).toEqual(["warningSigns", "myCoping", "distractions", "helperList", "safeEnvironment", "reasons"]);
    expect(PLAN_FIELDS.map((f) => f.key)).toEqual(["warningSigns", "myCoping", "distractions", "safeEnvironment", "reasons"]);
  });
  it("ελλιπείς ενότητες: κενό πλάνο = και οι 6 ετικέτες (οι άνθρωποι μία)", () => {
    expect(missingSections(null)).toHaveLength(6);
    expect(missingSections({})).toContain(HELPERS_LABEL);
    // Η λίστα μετράει συμπληρωμένη μόνο με όνομα· τηλέφωνο χωρίς όνομα ή παλιό ελεύθερο κείμενο δεν αρκούν.
    expect(missingSections({ helperList: [{ name: "", phone: "69" }], helpers: "η Άννα" })).toContain(HELPERS_LABEL);
    expect(missingSections({ helperList: [{ name: "Άννα", phone: "" }] })).not.toContain(HELPERS_LABEL);
    expect(missingSections({ warningSigns: "  ", myCoping: "περπάτημα" })).not.toContain("Τι με βοηθά εκείνη τη στιγμή;");
    expect(missingSections({ warningSigns: "  " })).toContain("Πώς καταλαβαίνω ότι δυσκολεύομαι;");
    const full = { warningSigns: "α", myCoping: "β", distractions: "γ", safeEnvironment: "δ", reasons: "ε", helperList: [{ name: "Άννα", phone: "" }] };
    expect(missingSections(full)).toEqual([]);
  });
  it("έχει περιεχόμενο", () => {
    expect(hasPlanContent(null)).toBe(false);
    expect(hasPlanContent({ helperList: [] })).toBe(false);
    expect(hasPlanContent({ reasons: "τα παιδιά μου" })).toBe(true);
    expect(hasPlanContent({ helpers: "παλιό κείμενο" })).toBe(true);
    expect(hasPlanContent({ discussed: [{ at: "2026-10-01T10:00:00Z", byId: "x", byName: "Μ." }] })).toBe(false);
  });
  it("τελευταία ανασκόπηση = η πιο πρόσφατη από αλλαγή και «συζητήθηκε»", () => {
    const upd = new Date("2026-10-05T10:00:00Z");
    expect(lastReviewAt(upd, null)?.toISOString()).toBe(upd.toISOString());
    expect(lastReviewAt(null, null)).toBeNull();
    const p = { discussed: [{ at: "2026-10-01T10:00:00Z", byId: "a", byName: "Α" }, { at: "2026-10-09T10:00:00Z", byId: "b", byName: "Β" }, { at: "σκουπίδι", byId: "c", byName: "Γ" }] };
    expect(lastReviewAt(upd, p)?.toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(lastReviewAt(new Date("2026-10-12T10:00:00Z"), p)?.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(lastDiscussed(p)?.byName).toBe("Β");
    expect(lastDiscussed({})).toBeNull();
  });
});
