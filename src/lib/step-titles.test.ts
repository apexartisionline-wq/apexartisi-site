import { describe, expect, it } from "vitest";
import { STEP_TITLES, stepTitle } from "./step-titles";

describe("STEP_TITLES", () => {
  it("ένας μη κενός, μοναδικός τίτλος για καθένα από τα 12 βήματα", () => {
    const t = Array.from({ length: 12 }, (_, i) => stepTitle(i + 1));
    expect(t.every((x) => x.length > 0)).toBe(true);
    expect(new Set(t).size).toBe(12);
    expect(Object.keys(STEP_TITLES)).toHaveLength(12);
  });
  it("εκτός 1–12: κενό", () => {
    expect(stepTitle(0)).toBe("");
    expect(stepTitle(13)).toBe("");
  });
});
