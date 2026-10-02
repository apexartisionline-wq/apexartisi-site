import { describe, expect, it } from "vitest";
import { composeNote, noteFlags, noteFormSchema, soberDays } from "./note-form";

const base = { sober: true, safeOk: true, notify: false, intervention: "Να μείνει στο δικό της συναίσθημα" };

describe("noteFormSchema", () => {
  it("δέχεται ένα σύντομο σημείωμα", () => {
    expect(noteFormSchema.safeParse(base).success).toBe(true);
  });
  it("ανησυχία χωρίς λόγια: δεν αποθηκεύεται", () => {
    const r = noteFormSchema.safeParse({ ...base, safeOk: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["concern"]);
  });
  it("όχι νηφάλιος χωρίς νέα ημερομηνία: δεν αποθηκεύεται", () => {
    expect(noteFormSchema.safeParse({ ...base, sober: false }).success).toBe(false);
    expect(noteFormSchema.safeParse({ ...base, sober: false, newSoberSince: "2026-10-01" }).success).toBe(true);
  });
  it("κενό σημείωμα: δεν αποθηκεύεται", () => {
    expect(noteFormSchema.safeParse({ sober: true, safeOk: true, notify: false }).success).toBe(false);
  });
  it("άγνωστη επιλογή διάθεσης: απορρίπτεται", () => {
    expect(noteFormSchema.safeParse({ ...base, mood: "Τέλεια" }).success).toBe(false);
  });
});

describe("composeNote / noteFlags", () => {
  it("κείμενο με τη σειρά της ομάδας και σωστές σημάνσεις", () => {
    const d = noteFormSchema.parse({
      ...base,
      presented: ["Φορτισμένος/η"],
      presentedText: "έντονη ροή λόγου",
      mood: "Χαμηλή",
      brought: ["Οικογένεια"],
      defenses: ["Εκλογίκευση"],
      safeOk: false,
      concern: "Ενημέρωσα την Εύα",
    });
    const t = composeNote(d);
    expect(t.indexOf("Πώς παρουσιάστηκε")).toBeLessThan(t.indexOf("Τι έφερε"));
    expect(t).toContain("Φορτισμένος/η — έντονη ροή λόγου");
    expect(t).toContain("Προβληματισμός προς τη θεραπευτική ομάδα: Ενημέρωσα την Εύα");
    expect(noteFlags(d)).toEqual({ riskChange: "UP", usedSince: "NO" });
  });
});

describe("soberDays", () => {
  it("μετρά μέρες", () => {
    expect(soberDays("2026-08-11", "2026-10-08")).toBe(58);
    expect(soberDays(null, "2026-10-08")).toBeNull();
    expect(soberDays("2026-10-09", "2026-10-08")).toBeNull();
  });
});
