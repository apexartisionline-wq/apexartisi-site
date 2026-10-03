import { describe, expect, it } from "vitest";
import { composePairNote, hideOther, nameVariants, pairFlags, pairSideSchema } from "./pair-note";
import { vocative } from "./vocative";

const other = nameVariants("Νίκος Δοκιμαστικός", vocative);

describe("Therapair: ποτέ στοιχεία του άλλου", () => {
  it("το όνομα του άλλου γίνεται «το άλλο μέλος» (ολόκληρο, μικρό, κλητική)", () => {
    expect(hideOther("Μίλησε με τον Νίκο για τη ντροπή", other)).toBe("Μίλησε με το άλλο μέλος για τη ντροπή");
    expect(hideOther("Ο Νίκος Δοκιμαστικός τον στήριξε", other)).toBe("το άλλο μέλος τον στήριξε");
    expect(hideOther("Είπε στον Νίκο ευχαριστώ", other)).toBe("Είπε στο άλλο μέλος ευχαριστώ");
    expect(hideOther("Νίκος.", other)).toBe("το άλλο μέλος.");
    expect(hideOther("Νικόλαος δεν πειράζεται", other)).toBe("Νικόλαος δεν πειράζεται");
  });
  it("το σημείωμα δεν έχει το όνομα του άλλου", () => {
    const d = pairSideSchema.parse({ connected: "Λίγο", emergedText: "Ο Νίκος μίλησε για τον πατέρα του και εκείνη συγκινήθηκε", outcome: "Νιώθει λιγότερο μόνη" });
    const t = composePairNote(d, other);
    expect(t).not.toContain("Νίκ");
    expect(t).toContain("Συνδέθηκε με το άλλο μέλος: Λίγο");
  });
  it("χρειάζεται τι εμφανίστηκε, εκτός αν δεν ήρθε", () => {
    expect(pairSideSchema.safeParse({}).success).toBe(false);
    expect(pairSideSchema.safeParse({ came: false }).success).toBe(true);
  });
  it("ενημέρωση ομάδας όταν αλλάζει η ασφάλεια", () => {
    expect(pairFlags(pairSideSchema.parse({ outcome: "x", safeOk: false, concern: "ενημέρωσα" })).notify).toBe(true);
  });
});
