import { describe, expect, it } from "vitest";
import { MOTTOS, mottoFor } from "./mottos";

describe("μότο της ημέρας", () => {
  it("σταθερό ανά ημερομηνία, διαφορετικό την επόμενη μέρα, από τη λίστα", () => {
    expect(mottoFor("2026-10-17")).toBe(mottoFor("2026-10-17"));
    expect(mottoFor("2026-10-17")).not.toBe(mottoFor("2026-10-18"));
    expect(MOTTOS).toContain(mottoFor("2026-10-17"));
  });
  it("όλες οι φράσεις σύντομες, μοναδικές, χωρίς «apex/rtisi» και χωρίς κλινικές λέξεις προς το μέλος", () => {
    expect(new Set(MOTTOS).size).toBe(MOTTOS.length);
    for (const m of MOTTOS) { expect(m.length).toBeLessThanOrEqual(80); expect(m).not.toMatch(/rtisi|διάγνωση/i); }
  });
});
