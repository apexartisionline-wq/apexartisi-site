import { describe, expect, it } from "vitest";
import { welcomeEmail } from "./welcome-email";

describe("welcomeEmail", () => {
  const m = welcomeEmail({ name: "Νίκος Δοκιμαστικός", username: "nikos", code: "ABCD-1234", url: "https://x.test", groups: [{ weekday: 1, time: "21:00" }, { weekday: 6, time: "18:00" }], contactEmail: "team@x.test" });
  it("έχει όνομα, στοιχεία εισόδου, αλλαγή κωδικού, ομάδες, 112/166, επικοινωνία", () => {
    expect(m.subject).toContain("Καλώς ήρθες");
    for (const s of ["Γεια σου, Νίκος", "https://x.test", "nikos", "ABCD-1234", "δικό σου κωδικό", "Δευτέρα 21:00, Σάββατο 18:00", "112 ή το 166", "team@x.test", "μόνο η ομάδα σου"]) expect(m.text).toContain(s);
  });
  it("λέξεις προς το μέλος: «ατομική», «η ομάδα σου», όχι «συνεδρία»/«app»", () => {
    expect(m.text).not.toMatch(/συνεδρία|\bapp\b/i);
    expect(m.text).toContain("ατομική");
  });
  it("χωρίς ομάδες στις ρυθμίσεις: παραπέμπει στο «Σήμερα»", () => {
    expect(welcomeEmail({ name: "Α", username: "a", code: "c", url: "", groups: [], contactEmail: "e" }).text).toContain("θα τις δεις στο «Σήμερα»");
  });
});
