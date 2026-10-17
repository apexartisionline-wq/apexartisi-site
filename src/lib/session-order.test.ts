import { describe, expect, it } from "vitest";
import { countsAsCame, ordinalLabel, protocolStep, sessionLabel, sessionOrdinal } from "./session-order";

describe("αρίθμηση ατομικών", () => {
  it("πρώτη ατομική χωρίς προηγούμενες = 1η", () => {
    expect(sessionOrdinal([])).toBe(1);
  });
  it("μετρούν μόνο οι ατομικές με παρουσία", () => {
    expect(sessionOrdinal([
      { confirmedCame: true, joinedAt: null },          // ήρθε (σημείωμα)
      { confirmedCame: false, joinedAt: new Date() },   // «Δεν ήρθε» υπερισχύει του «Μπες»
      { confirmedCame: null, joinedAt: new Date() },    // πάτησε «Μπες», χωρίς σημείωμα ακόμα
      { confirmedCame: null, joinedAt: null },          // χωρίς καταγραφή
    ])).toBe(3);
  });
  it("η επιβεβαίωση υπερισχύει του πατήματος", () => {
    expect(countsAsCame({ confirmedCame: false, joinedAt: "2026-10-01T10:00:00Z" })).toBe(false);
    expect(countsAsCame({ confirmedCame: true, joinedAt: null })).toBe(true);
    expect(countsAsCame({ confirmedCame: null, joinedAt: "2026-10-01T10:00:00Z" })).toBe(true);
    expect(countsAsCame({ confirmedCame: null, joinedAt: null })).toBe(false);
  });
});

describe("βήμα πρωτοκόλλου", () => {
  it("χωρίς ιστορικό → λήψη ιστορικού, ακόμη κι αν υπάρχει πλάνο", () => {
    expect(protocolStep({ assessed: false, planWritten: false })).toBe("history");
    expect(protocolStep({ assessed: false, planWritten: true })).toBe("history");
  });
  it("με ιστορικό, χωρίς πλάνο → πλάνο υποστήριξης", () => {
    expect(protocolStep({ assessed: true, planWritten: false })).toBe("plan");
  });
  it("με ιστορικό και πλάνο → μόνο ο αριθμός", () => {
    expect(protocolStep({ assessed: true, planWritten: true })).toBeNull();
  });
  it("ετικέτες", () => {
    expect(ordinalLabel(1)).toBe("1η ατομική");
    expect(sessionLabel(1, "history")).toBe("1η ατομική · λήψη ιστορικού");
    expect(sessionLabel(2, "plan")).toBe("2η ατομική · πλάνο υποστήριξης");
    expect(sessionLabel(5, null)).toBe("5η ατομική");
  });
});
