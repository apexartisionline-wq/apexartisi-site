import { describe, expect, it } from "vitest";
import { canMarkStep, intakeStatus, latestChoices, STAFF_STEPS } from "./intake-rules";

const allSteps = STAFF_STEPS.filter((s) => !s.autognosiaOnly).map((s) => s.key);
const allConsents = {
  record: "YES", journal: "NO", forms: "YES", telegram: "YES", self_message: "NO", emergency_contact: "YES", confidentiality: "YES",
} as const;

describe("intake", () => {
  it("is complete only with every step and a recorded choice for every purpose", () => {
    expect(intakeStatus({ source: "APEX", done: allSteps, consents: { ...allConsents } }).complete).toBe(true);
    // Οι ανάγκες ασφάλειας δεν χρειάζονται για την έναρξη (μόνο όταν υπάρχει λόγος).
    expect(intakeStatus({ source: "APEX", done: allSteps.filter((k) => k !== "risk"), consents: { ...allConsents } }).complete).toBe(true);
    const noPlan = intakeStatus({ source: "APEX", done: allSteps.filter((k) => k !== "safety_plan"), consents: { ...allConsents } });
    expect(noPlan.complete).toBe(false);
    expect(noPlan.missingSteps.map((s) => s.key)).toEqual(["safety_plan"]);
    const { forms: _f, ...noForms } = allConsents;
    expect(intakeStatus({ source: "APEX", done: allSteps, consents: noForms }).missingConsents.map((p) => p.key)).toEqual(["forms"]);
  });

  it("requires a yes for the file and the confidentiality statement", () => {
    expect(intakeStatus({ source: "APEX", done: allSteps, consents: { ...allConsents, record: "NO" } }).complete).toBe(false);
    expect(intakeStatus({ source: "APEX", done: allSteps, consents: { ...allConsents, confidentiality: undefined } }).complete).toBe(false);
  });

  it("asks for the AUTOGNOSIA PLUS summary and consents only for members coming from there", () => {
    const s = intakeStatus({ source: "AUTOGNOSIA_PLUS", done: allSteps, consents: { ...allConsents } });
    expect(s.missingSteps.map((x) => x.key)).toEqual(["autognosia_summary"]);
    expect(s.missingConsents.map((x) => x.key)).toEqual(["autognosia_in", "autognosia_out"]);
  });

  it("uses the latest choice per purpose", () => {
    const t = (m: number) => new Date(2026, 8, 27, 10, m);
    expect(latestChoices([
      { purpose: "telegram", choice: "YES", recordedAt: t(1) },
      { purpose: "telegram", choice: "NO", recordedAt: t(5) },
      { purpose: "journal", choice: "YES", recordedAt: t(2) },
    ])).toEqual({ telegram: "NO", journal: "YES" });
  });

  it("lets only psychologists mark the clinical assessments", () => {
    const risk = STAFF_STEPS.find((s) => s.key === "risk")!;
    const plan = STAFF_STEPS.find((s) => s.key === "safety_plan")!;
    expect(canMarkStep(risk, "BIOMATIC")).toBe(false);
    expect(canMarkStep(risk, null)).toBe(false);
    expect(canMarkStep(risk, "CLINICAL")).toBe(true);
    expect(canMarkStep(risk, "BOTH")).toBe(true);
    expect(canMarkStep(plan, "BIOMATIC")).toBe(true);
  });
});
