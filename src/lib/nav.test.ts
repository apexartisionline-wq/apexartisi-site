import { describe, expect, it } from "vitest";
import { navLinks } from "./nav";

describe("μενού αποφοίτου (25/10)", () => {
  const hrefs = (alumnus: boolean) => navLinks("MEMBER", { alumnus }).map((l) => l.href);
  it("ο απόφοιτος δεν βλέπει ημερολόγιο και εργασίες", () => {
    expect(hrefs(true)).not.toContain("/m/journal");
    expect(hrefs(true)).not.toContain("/m/library");
  });
  it("κρατά «Σήμερα», ραντεβού και θεματικές", () => {
    for (const h of ["/m", "/m/book", "/m/texts"]) expect(hrefs(true)).toContain(h);
  });
  it("το μέλος του προγράμματος τα βλέπει όλα", () => {
    expect(hrefs(false)).toContain("/m/journal");
    expect(hrefs(false)).toContain("/m/library");
  });
  it("η διαχείριση έχει «Πληρωμές αποφοίτων»", () => {
    expect(navLinks("ADMIN").map((l) => l.href)).toContain("/admin/alumni-payments");
  });
});
