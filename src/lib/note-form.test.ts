import { describe, expect, it } from "vitest";
import { alertWorthy, composeNote, noteFlags, noteFormSchema, soberDays } from "./note-form";

const base = { sober: true, safeOk: true, notify: false, intervention: "Να μείνει στο δικό της συναίσθημα" };

describe("noteFormSchema", () => {
  it("δέχεται ένα σύντομο σημείωμα", () => {
    expect(noteFormSchema.safeParse(base).success).toBe(true);
  });
  it("ανησυχία χωρίς λόγια: δεν αποθηκεύεται", () => {
    const r = noteFormSchema.safeParse({ ...base, safeOk: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["safetyText"]);
  });
  it("ανησυχία: ο προβληματισμός δεν αρκεί — χρειάζεται δική της γραμμή", () => {
    expect(noteFormSchema.safeParse({ ...base, safeOk: false, concern: "παλιό κείμενο" }).success).toBe(false);
    expect(noteFormSchema.safeParse({ ...base, safeOk: false, safetyText: "σκέψεις χωρίς σχέδιο· ενημέρωσα τη Δήμητρα" }).success).toBe(true);
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
      safetyText: "σκέψεις χωρίς σχέδιο· ενημέρωσα την Εύα",
      concern: "Ενημέρωσα την Εύα",
    });
    const t = composeNote(d);
    expect(t.indexOf("Πώς παρουσιάστηκε")).toBeLessThan(t.indexOf("Τι έφερε"));
    expect(t).toContain("Φορτισμένος/η — έντονη ροή λόγου");
    expect(t).toContain("Προβληματισμός προς τη θεραπευτική ομάδα: Ενημέρωσα την Εύα");
    expect(t).toContain("Ανησυχία για την ασφάλεια: Ναι — σκέψεις χωρίς σχέδιο");
    expect(noteFlags(d)).toEqual({ riskChange: "UP", usedSince: "NO", notify: true });
  });
  it("«Δεν ήρθε»: δεν χρειάζεται «τι έφερε» και γράφεται στο κείμενο", () => {
    const d = noteFormSchema.parse({ ...base, came: false, brought: [], broughtText: "", intervention: "" });
    expect(composeNote(d)).toContain("Δεν ήρθε στην ατομική.");
    expect(noteFlags(d).notify).toBe(false);
  });
  it("«Δεν ήρθε»: μόνο τι έγινε, όχι κλινικά πεδία", () => {
    const t = composeNote(noteFormSchema.parse({ ...base, came: false, absentText: "ενημέρωσε ότι είναι άρρωστος", mood: "Χαμηλή" }));
    expect(t).toContain("Τι έγινε / τι κάνουμε: ενημέρωσε ότι είναι άρρωστος");
    expect(t).not.toContain("Διάθεση");
    expect(t).not.toContain("Νηφαλιότητα από την προηγούμενη φορά");
  });
  it("«Γράφει απογραφές» μετά τα θετικά", () => {
    const t = composeNote(noteFormSchema.parse({ ...base, positives: "ήρθε στην ώρα του", journaling: "Λίγο" }));
    expect(t.indexOf("Τα θετικά")).toBeLessThan(t.indexOf("Γράφει απογραφές: Λίγο"));
  });
});

describe("alertWorthy", () => {
  it("την πρώτη φορά: ό,τι ζητά ενημέρωση", () => {
    expect(alertWorthy(null, { safeOk: true, concern: "", notify: false })).toBe(false);
    expect(alertWorthy(null, { safeOk: true, concern: "κάτι", notify: false })).toBe(true);
  });
  it("σε διόρθωση: μόνο κάτι καινούργιο", () => {
    const prev = { safeOk: true, concern: "κάτι", notify: true };
    expect(alertWorthy(prev, { safeOk: true, concern: "κάτι", notify: false })).toBe(false);
    expect(alertWorthy(prev, { safeOk: true, concern: "κάτι άλλο", notify: false })).toBe(true);
    expect(alertWorthy(prev, { safeOk: false, safetyText: "x", concern: "κάτι", notify: false })).toBe(true);
    expect(alertWorthy({ notify: false }, { notify: true })).toBe(true);
  });
});

describe("soberDays", () => {
  it("μετρά μέρες", () => {
    expect(soberDays("2026-08-11", "2026-10-08")).toBe(58);
    expect(soberDays(null, "2026-10-08")).toBeNull();
    expect(soberDays("2026-10-09", "2026-10-08")).toBeNull();
  });
});
