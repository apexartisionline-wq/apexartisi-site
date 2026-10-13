import { describe, expect, it } from "vitest";
import { extractSafety } from "./note-form";
import { neededKind, pickSlot } from "./program";

describe("μεταβίβαση ανάμεσα σε εναλλασσόμενους θεραπευτές", () => {
  it("η γραμμή ασφάλειας και ο προβληματισμός βγαίνουν από το κείμενο του σημειώματος", () => {
    const text = [
      "Πώς παρουσιάστηκε: Αγχωμένα",
      "Τι έφερε: Δουλειά",
      "Νηφαλιότητα από την προηγούμενη φορά: ναι.",
      "Ανησυχία για την ασφάλεια: Ναι — μίλησε για απελπισία, ενημερώθηκε η διαχείριση",
      "Προβληματισμός προς τη θεραπευτική ομάδα: Να το δει ψυχολόγος την Πέμπτη",
    ].join("\n");
    expect(extractSafety(text)).toEqual({ safeOk: false, safetyText: "μίλησε για απελπισία, ενημερώθηκε η διαχείριση", concern: "Να το δει ψυχολόγος την Πέμπτη" });
  });
  it("«Όχι» = χωρίς ανησυχία· παλιό σημείωμα χωρίς γραμμή = άγνωστο", () => {
    expect(extractSafety("Τι έφερε: κάτι\nΑνησυχία για την ασφάλεια: Όχι.")).toEqual({ safeOk: true, safetyText: "", concern: "" });
    expect(extractSafety("Ελεύθερο κείμενο χωρίς δομή")).toEqual({ safeOk: null, safetyText: "", concern: "" });
  });
  it("«Ναι» χωρίς κείμενο δεν χάνεται", () => {
    expect(extractSafety("Ανησυχία για την ασφάλεια: Ναι — βλ. προβληματισμό").safeOk).toBe(false);
  });
});

describe("εναλλαγή κλινικού / βιωματικού στο κλείσιμο", () => {
  const free = [{ id: "b", therapistKind: "BIOMATIC" as const }, { id: "c", therapistKind: "CLINICAL" as const }];
  it("μετά από ψυχολόγο έρχεται βιωματικός και αντίστροφα", () => {
    expect(neededKind("CLINICAL")).toBe("BIOMATIC");
    expect(neededKind("BIOMATIC")).toBe("CLINICAL");
    expect(neededKind(null)).toBeNull();
  });
  it("η 1η ατομική (χωρίς αξιολόγηση) ζητά ψυχολόγο: η θέση που διαλέγεται είναι κλινική", () => {
    const pick = pickSlot(free, "CLINICAL");
    expect(pick?.slot.id).toBe("c");
    expect(pick?.ok).toBe(true);
  });
  it("αν δεν υπάρχει ψυχολόγος την ώρα, κλείνει αλλά σημειώνεται για έλεγχο", () => {
    const pick = pickSlot([free[0]], "CLINICAL");
    expect(pick?.slot.id).toBe("b");
    expect(pick?.ok).toBe(false);
  });
});
