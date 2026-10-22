import { describe, expect, it } from "vitest";
import { cycleDoneText, teamMessageEmail } from "./team-message-email";

describe("teamMessageEmail", () => {
  it("ουδέτερο: όνομα και σύνδεσμος, ποτέ το κείμενο ή λέξεις για πρόγραμμα", () => {
    const m = teamMessageEmail({ name: "Νίκος Δοκιμαστικός", url: "https://x.test/m/message" });
    expect(m.text).toContain("Γεια σου, Νίκο.");
    expect(m.text).toContain("https://x.test/m/message");
    expect(m.subject + m.text).not.toMatch(/ανάκαμψ|απεξάρτ|θεραπ|κύκλ|ομάδα σου/i);
  });
});

describe("cycleDoneText", () => {
  it("κλητική, θετικό πρόσημο, χωρίς αριθμούς ή χρέωση", () => {
    const t = cycleDoneText("Νίκος Δοκιμαστικός");
    expect(t.startsWith("Νίκο, ολοκλήρωσες τον κύκλο σου.")).toBe(true);
    expect(t).not.toMatch(/\d|πληρω|χρέω|συμφωνητικ/);
  });
});
