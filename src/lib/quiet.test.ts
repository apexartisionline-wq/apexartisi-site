import { describe, expect, it } from "vitest";
import { quietUntil } from "./quiet";

describe("ήσυχες ώρες", () => {
  it("μέρα: φεύγει αμέσως", () => {
    expect(quietUntil(new Date("2026-10-05T12:00:00Z"))).toBeNull(); // 15:00 Ελλάδα
  });
  it("μετά τις 22:00: περιμένει ως τις 08:00 της επόμενης", () => {
    expect(quietUntil(new Date("2026-10-05T20:30:00Z"))?.toISOString()).toBe("2026-10-06T05:00:00.000Z"); // 23:30 → 08:00
  });
  it("πριν τις 08:00: περιμένει ως τις 08:00 της ίδιας μέρας", () => {
    expect(quietUntil(new Date("2026-10-06T02:00:00Z"))?.toISOString()).toBe("2026-10-06T05:00:00.000Z"); // 05:00 → 08:00
  });
});
