import { describe, expect, it } from "vitest";
import { athensToUtc, formatSpan, formatTime, localParts } from "./time";

describe("ώρες συνεδρίας (Europe/Athens)", () => {
  it("η ώρα της θέσης και η προγραμματισμένη έναρξη συμφωνούν, και γύρω από την αλλαγή ώρας", () => {
    for (const date of ["2026-10-13", "2026-10-24", "2026-10-25", "2026-10-26", "2026-03-28", "2026-03-29", "2026-03-30"]) {
      for (let hour = 0; hour < 24; hour++) {
        const p = localParts(athensToUtc(date, hour));
        // Στη ώρα που «δεν υπάρχει» (αλλαγή ώρας) επιτρέπεται μετατόπιση· αλλιώς ακριβής αντιστοιχία.
        if (date === "2026-03-29" && hour === 3) continue;
        expect({ date: p.date, hour: p.hour, minute: p.minute }).toEqual({ date, hour, minute: 0 });
      }
    }
  });
  it("η διάρκεια μετρά από την έναρξη, με την ίδια ώρα παντού", () => {
    const start = athensToUtc("2026-10-13", 18);
    expect(formatTime(start)).toBe("18:00");
    expect(formatSpan(start, 50)).toBe("18:00–18:50");
  });
  it("δοκιμαστική ατομική που ξεκινά σε λεπτά εμφανίζει την πραγματική της ώρα", () => {
    const start = new Date(athensToUtc("2026-10-13", 0).getTime() + 11 * 60_000);
    expect(formatSpan(start, 40)).toBe("00:11–00:51");
  });
});
