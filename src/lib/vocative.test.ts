import { describe, expect, it } from "vitest";
import { vocative } from "./vocative";

describe("κλητική", () => {
  it("ανδρικά ονόματα", () => {
    expect(vocative("Κώστας")).toBe("Κώστα");
    expect(vocative("Γιάννης")).toBe("Γιάννη");
    expect(vocative("Βασίλης")).toBe("Βασίλη");
    expect(vocative("Νίκος")).toBe("Νίκο");
    expect(vocative("Γιώργος")).toBe("Γιώργο");
    expect(vocative("Πέτρος")).toBe("Πέτρο");
    expect(vocative("Αλέξανδρος")).toBe("Αλέξανδρε");
    expect(vocative("Θεόδωρος")).toBe("Θεόδωρε");
  });
  it("γυναικεία μένουν ίδια", () => {
    expect(vocative("Ελένη")).toBe("Ελένη");
    expect(vocative("Μαρία")).toBe("Μαρία");
    expect(vocative("Σοφία")).toBe("Σοφία");
  });
});
