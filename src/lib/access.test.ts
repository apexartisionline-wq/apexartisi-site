import { describe, expect, it } from "vitest";
import { isPsychologist, seesJournalDetail, seesMonthFolder, watermarkCss, watermarksNotes, watermarkWhen } from "./access";

const admin = { role: "ADMIN", therapistKind: null };
const psy = { role: "THERAPIST", therapistKind: "CLINICAL" };
const both = { role: "THERAPIST", therapistKind: "BOTH" };
const bio = { role: "THERAPIST", therapistKind: "BIOMATIC" };

describe("τι βλέπει ο θεραπευτής (απόφαση 13/10)", () => {
  it("αξιολογήσεις και ανάγκες ασφάλειας: ψυχολόγος ή διαχείριση, όχι βιωματικός", () => {
    expect(isPsychologist(admin)).toBe(true);
    expect(isPsychologist(psy)).toBe(true);
    expect(isPsychologist(both)).toBe(true);
    expect(isPsychologist(bio)).toBe(false);
  });
  it("ημερολόγιο μέρα-μέρα και φάκελος μήνα: μόνο διαχείριση — ούτε ο ψυχολόγος", () => {
    expect(seesJournalDetail(admin)).toBe(true);
    expect(seesJournalDetail(psy)).toBe(false);
    expect(seesJournalDetail(bio)).toBe(false);
    expect(seesMonthFolder(admin)).toBe(true);
    expect(seesMonthFolder(psy)).toBe(false);
  });
  it("υδατογράφημα σε όλους τους θεραπευτές, όχι στη διαχείριση", () => {
    expect(watermarksNotes(psy)).toBe(true);
    expect(watermarksNotes(bio)).toBe(true);
    expect(watermarksNotes(admin)).toBe(false);
  });
  it("το υδατογράφημα έχει όνομα και ώρα, με ασφαλή κωδικοποίηση", () => {
    const css = watermarkCss('Άννα <"x">', "13/10/2026 21:40");
    expect(css.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(css.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg).toContain("&#60;&#34;x&#34;&#62;");
    expect(svg).toContain("13/10/2026 21:40");
    expect(svg).not.toContain("<\"");
    expect(watermarkCss("Α", "τ", true)).toContain("%23FFFFFF");
  });
  it("η ώρα του υδατογραφήματος είναι ώρα Ελλάδας με έτος", () => {
    expect(watermarkWhen(new Date("2026-10-13T18:40:00Z"))).toBe("13/10/2026 21:40");
  });
});
