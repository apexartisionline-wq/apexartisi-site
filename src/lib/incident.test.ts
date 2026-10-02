import { describe, expect, it } from "vitest";
import { doorOpenMessage, incidentSchema } from "./incident";

describe("συμβάν", () => {
  it("θέλει είδος, ώρα, τι έγινε, τι κάναμε", () => {
    expect(incidentSchema.safeParse({ kind: "Άλλο σοβαρό", happenedAt: "2026-10-03T21:10", what: "", actions: "x" }).success).toBe(false);
    expect(incidentSchema.safeParse({ kind: "Άλλο σοβαρό", happenedAt: "2026-10-03T21:10", what: "x", actions: "y" }).success).toBe(true);
  });
});
describe("μήνυμα ολοκλήρωσης", () => {
  it("ζεστό, με ανοιχτή πόρτα", () => {
    const m = doorOpenMessage("Νίκος", 3);
    expect(m).toContain("3 μήνες");
    expect(m).toContain("πόρτα μας είναι πάντα ανοιχτή");
  });
});
