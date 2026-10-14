import { describe, expect, it } from "vitest";
import { cycleIsComplete, describeCycleProgress } from "./cycle-rules";

describe("ολοκλήρωση κύκλου (απόφαση 14/10): ατομικές ΚΑΙ ομάδες", () => {
  it("δεν τελειώνει μόνο με τις ατομικές, ούτε μόνο με τις ομάδες", () => {
    expect(cycleIsComplete({ sessionsPassed: 8, sessionsTotal: 8, groupsPassed: 12, groupsTotal: 16 })).toBe(false);
    expect(cycleIsComplete({ sessionsPassed: 6, sessionsTotal: 8, groupsPassed: 16, groupsTotal: 16 })).toBe(false);
    expect(cycleIsComplete({ sessionsPassed: 8, sessionsTotal: 8, groupsPassed: 16, groupsTotal: 16 })).toBe(true);
    expect(cycleIsComplete({ sessionsPassed: 9, sessionsTotal: 8, groupsPassed: 17, groupsTotal: 16 })).toBe(true);
  });
  it("η πρόοδος με λέξεις", () => {
    expect(describeCycleProgress({ sessionsPassed: 6, sessionsTotal: 8, groupsPassed: 12, groupsTotal: 16 })).toBe("6 από 8 ατομικές · 12 από 16 ομάδες έχουν περάσει");
  });
});
