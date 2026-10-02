import { describe, expect, it } from "vitest";
import {
  assessmentAlerts, assessmentLines, assessmentSchema, auditScore, dastScore, keepAdminOnly, missingForComplete, pgsiScore,
  questionnaires, soberSinceFrom, stripAdminOnly,
} from "./assessment";

const base = assessmentSchema.parse({});

describe("βαθμολογίες", () => {
  it("AUDIT: ζώνες του ΠΟΥ", () => {
    expect(auditScore([])).toBeNull();
    expect(auditScore([1, 1, 1, 1, 1, 1, 1, 0, 0, 0])).toMatchObject({ score: 7, band: "χαμηλός κίνδυνος" });
    expect(auditScore([2, 2, 2, 2, 0, 0, 0, 0, 0, 0])).toMatchObject({ score: 8, band: "επικίνδυνη χρήση" });
    expect(auditScore([4, 4, 4, 4, 2, 0, 0, 0, 0, 0])).toMatchObject({ score: 18, band: "επιβλαβής χρήση", level: "amber" });
    expect(auditScore([4, 4, 4, 4, 4, 0, 0, 0, 0, 0])).toMatchObject({ score: 20, band: "πιθανή εξάρτηση", level: "red" });
    expect(auditScore([1, null, 2])).toMatchObject({ score: 3, answered: 2 });
  });
  it("DAST-10: η ερώτηση 3 μετρά ανάποδα", () => {
    expect(dastScore([false, false, true, false, false, false, false, false, false, false])).toMatchObject({ score: 0, band: "χωρίς ένδειξη" });
    expect(dastScore([false, false, false, false, false, false, false, false, false, false])).toMatchObject({ score: 1, band: "χαμηλό" });
    expect(dastScore([true, true, false, true, true, true, false, false, false, false])).toMatchObject({ score: 6, band: "σημαντικό" });
    expect(dastScore(Array(10).fill(true))).toMatchObject({ score: 9, band: "σοβαρό" });
  });
  it("PGSI: κατηγορίες 0 / 1–2 / 3–7 / 8+", () => {
    expect(pgsiScore(Array(9).fill(0))).toMatchObject({ score: 0, band: "χωρίς πρόβλημα" });
    expect(pgsiScore([1, 1, 0, 0, 0, 0, 0, 0, 0])).toMatchObject({ score: 2, band: "χαμηλός κίνδυνος" });
    expect(pgsiScore([3, 3, 1, 0, 0, 0, 0, 0, 0])).toMatchObject({ score: 7, band: "μέτριος κίνδυνος" });
    expect(pgsiScore([3, 3, 2, 0, 0, 0, 0, 0, 0])).toMatchObject({ score: 8, band: "προβληματικός τζόγος" });
  });
});

describe("ποια ερωτηματολόγια ανοίγουν", () => {
  it("τζόγος → PGSI, ουσία εκτός αλκοόλ → DAST-10", () => {
    expect(questionnaires({ substances: ["alcohol"] })).toEqual({ audit: true, dast: false, pgsi: false });
    expect(questionnaires({ substances: ["alcohol", "gambling"] })).toEqual({ audit: true, dast: false, pgsi: true });
    expect(questionnaires({ substances: ["cocaine"] })).toEqual({ audit: true, dast: true, pgsi: false });
  });
});

describe("νηφαλιότητα από το ιστορικό", () => {
  it("η πιο πρόσφατη τελευταία φορά, μόνο από όσα τσεκαρίστηκαν", () => {
    expect(soberSinceFrom({ substances: [], perSubstance: {} })).toBeNull();
    expect(soberSinceFrom({
      substances: ["alcohol", "cocaine"],
      perSubstance: { alcohol: { lastUse: "2025-03-12" }, cocaine: { lastUse: "2025-02-01" }, cannabis: { lastUse: "2026-01-01" } },
    })).toBe("2025-03-12");
  });
});

describe("ειδοποιήσεις", () => {
  const today = "2026-10-02";
  it("τίποτα όταν όλα είναι «όχι»", () => {
    expect(assessmentAlerts({ ...base, children: true, childConcern: false, violence: false, psychoticNow: false, pregnant: false }, today)).toEqual([]);
  });
  it("παιδί, βία, ψυχωσικά, εγκυμοσύνη", () => {
    expect(assessmentAlerts({ ...base, children: true, childConcern: true, violence: true, psychoticNow: true, pregnant: true }, today))
      .toEqual(["CHILD", "VIOLENCE", "PSYCHOSIS", "PREGNANCY"]);
  });
  it("υπερδοσολογία μόνο μέσα σε 3 μήνες", () => {
    expect(assessmentAlerts({ ...base, overdoseEver: true, overdoseLast: "2026-08-01" }, today)).toEqual(["OVERDOSE"]);
    expect(assessmentAlerts({ ...base, overdoseEver: true, overdoseLast: "2025-08-01" }, today)).toEqual([]);
  });
});

describe("πεδία της διαχείρισης", () => {
  const d = { ...base, psychiatristName: "Δρ Χ", psychiatristPhone: "2100000000", legalDetail: "βεβαίωση στο δικαστήριο", courtObligation: true };
  it("δεν φαίνονται στον θεραπευτή", () => {
    const flat = JSON.stringify(assessmentLines(d, { admin: false }));
    expect(flat).toContain("Δρ Χ");
    expect(flat).not.toContain("2100000000");
    expect(flat).not.toContain("βεβαίωση στο δικαστήριο");
    expect(JSON.stringify(assessmentLines(d, { admin: true }))).toContain("2100000000");
    expect(stripAdminOnly(d).psychiatristPhone).toBe("");
  });
  it("δεν χάνονται όταν αποθηκεύει κάποιος που δεν τα βλέπει", () => {
    expect(keepAdminOnly(stripAdminOnly(d), d).legalDetail).toBe("βεβαίωση στο δικαστήριο");
  });
});

describe("ολοκλήρωση", () => {
  it("λέει τι λείπει", () => {
    expect(missingForComplete(base).length).toBeGreaterThan(0);
    expect(missingForComplete({ ...base, profileConfirmed: true, substances: ["alcohol"], children: false, violence: false, psychoticNow: false, summary: "…" })).toEqual([]);
  });
});
