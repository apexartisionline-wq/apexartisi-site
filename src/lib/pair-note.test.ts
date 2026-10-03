import { describe, expect, it } from "vitest";
import { composePairNote, findOther, hideOther, nameVariants, pairFlags, pairSideSchema } from "./pair-note";
import { vocative } from "./vocative";

const other = nameVariants("Νίκος Δοκιμαστικός", vocative);

describe("Therapair: ποτέ στοιχεία του άλλου", () => {
  it("το όνομα του άλλου γίνεται «το άλλο μέλος» (ολόκληρο, μικρό, κλητική)", () => {
    expect(hideOther("Μίλησε με τον Νίκο για τη ντροπή", other)).toBe("Μίλησε με το άλλο μέλος για τη ντροπή");
    expect(hideOther("Ο Νίκος Δοκιμαστικός τον στήριξε", other)).toBe("Το άλλο μέλος τον στήριξε");
    expect(hideOther("Είπε στον Νίκο ευχαριστώ", other)).toBe("Είπε στο άλλο μέλος ευχαριστώ");
    expect(hideOther("Νίκος.", other)).toBe("Το άλλο μέλος.");
    expect(hideOther("Νικόλαος δεν πειράζεται", other)).toBe("Νικόλαος δεν πειράζεται");
  });
  it("πιάνει πτώσεις, χωρίς τόνους, κεφαλαία, χαϊδευτικά και αρχικό", () => {
    const g = nameVariants("Γιώργος Δοκιμαστικός", vocative);
    expect(hideOther("μίλησε για τη ντροπή του Γιώργου", g)).toBe("μίλησε για τη ντροπή του άλλου μέλους");
    expect(hideOther("ο Γιωργος συγκινήθηκε", g)).toBe("Το άλλο μέλος συγκινήθηκε");
    expect(hideOther("Μίλησε ο ΓΙΩΡΓΟΣ", g)).toBe("Μίλησε το άλλο μέλος");
    expect(hideOther("ο Γιώργης γέλασε", g)).toBe("Το άλλο μέλος γέλασε");
    expect(hideOther("τον στήριξε ο Γ. αμέσως", g)).toBe("τον στήριξε το άλλο μέλος αμέσως");
    const e = nameVariants("Ελένη Δοκιμαστική", vocative);
    expect(hideOther("τα λόγια της Ελένης", e)).toBe("τα λόγια του άλλου μέλους");
    expect(hideOther("η ΕΛΕΝΗ και η Ελενη", e)).toBe("Το άλλο μέλος και το άλλο μέλος");
    expect(findOther("άκουσε τον Γιωργο", g)).toEqual(["Γιωργο"]);
    expect(findOther("μίλησε για τη μητέρα του", g)).toEqual([]);
    const lena = nameVariants("Ελένη Δοκιμαστική", vocative, "Λένα");
    expect(hideOther("η Λένα τον ρώτησε· όπως λένε, της Λένας", lena)).toBe("Το άλλο μέλος τον ρώτησε· όπως λένε, του άλλου μέλους");
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
