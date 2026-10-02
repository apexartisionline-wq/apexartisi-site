import { describe, expect, it } from "vitest";
import { maskPhones, needsReview, riskSchema, suggestedLevel } from "./risk";

describe("ανάγκες ασφάλειας", () => {
  it("πρόταση επιπέδου", () => {
    expect(suggestedLevel({ notWorth: false, thoughtsMethod: false, intent: false, recentHarm: false })).toBe("LOW");
    expect(suggestedLevel({ notWorth: true, thoughtsMethod: false, intent: false, recentHarm: false })).toBe("LOW");
    expect(suggestedLevel({ thoughtsMethod: true })).toBe("MEDIUM");
    expect(suggestedLevel({ intent: true })).toBe("HIGH");
    expect(suggestedLevel({ recentHarm: true })).toBe("HIGH");
    expect(suggestedLevel({ notWorth: "DECLINED" })).toBeNull();
  });
  it("χωρίς επίπεδο και σημείωση δεν αποθηκεύεται", () => {
    expect(riskSchema.safeParse({}).success).toBe(false);
    expect(riskSchema.safeParse({ level: "LOW", rationale: "ήρεμος" }).success).toBe(true);
    expect(riskSchema.safeParse({ level: "MEDIUM", rationale: "πλάνο, τηλέφωνο αύριο" }).success).toBe(true);
  });
  it("θέλει αξιολόγηση μόνο αν η αφορμή είναι μετά την τελευταία", () => {
    const t = (d: string, text: string) => ({ at: new Date(d), text });
    expect(needsReview([t("2026-10-01", "Κόκκινο κουμπί")], new Date("2026-10-02"))).toBeNull();
    expect(needsReview([t("2026-10-03", "Υποτροπή"), t("2026-10-01", "x")], new Date("2026-10-02"))?.text).toBe("Υποτροπή");
    expect(needsReview([t("2026-10-01", "x")], null)?.text).toBe("x");
  });
  it("κρύβει τηλέφωνα", () => {
    expect(maskPhones("Άννα 6912345678, Κώστας +30 210 1234567")).toBe("Άννα •••, Κώστας •••");
    expect(maskPhones("2 φορές το 2024")).toBe("2 φορές το 2024");
  });
});
