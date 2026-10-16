import { describe, expect, it } from "vitest";
import { isStepMode, looksLikePdf, needsPdf, memberStepStatus, safeFileName, stepStatus } from "./step-modes";

describe("βήματα με τρεις τρόπους (16/10)", () => {
  it("τρόποι και PDF", () => {
    expect(isStepMode("FORM") && isStepMode("PDF_NOTEBOOK") && isStepMode("PDF_FILL")).toBe(true);
    expect(isStepMode("ALLO")).toBe(false);
    expect(needsPdf("FORM")).toBe(false);
    expect(needsPdf("PDF_FILL")).toBe(true);
  });
  it("αναγνωρίζει PDF από τον τύπο και τα πρώτα bytes", () => {
    expect(looksLikePdf("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(true);
    expect(looksLikePdf("application/pdf", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(looksLikePdf("image/png", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
  });
  it("κατάσταση με λέξεις", () => {
    const t = new Date();
    expect(stepStatus({ mode: "FORM", answeredAt: null, notebookAt: null, answerPdfAt: null })).toBe("Δεν το έγραψε ακόμα");
    expect(stepStatus({ mode: "PDF_NOTEBOOK", answeredAt: t, notebookAt: t, answerPdfAt: null })).toBe("Το έγραψε στο τετράδιο");
    expect(stepStatus({ mode: "PDF_FILL", answeredAt: t, notebookAt: null, answerPdfAt: t })).toBe("Ανέβασε το συμπληρωμένο PDF");
  });
  it("όνομα αρχείου χωρίς επικίνδυνους χαρακτήρες", () => {
    expect(safeFileName('βήμα "1"/a', "x.pdf")).toBe("βήμα 1 a.pdf");
    expect(safeFileName("", "vima.pdf")).toBe("vima.pdf");
  });
});

describe("memberStepStatus", () => {
  const t = new Date("2026-10-16T10:00:00Z");
  it("ίδιοι κανόνες με το stepStatus, με τα λόγια του μέλους", () => {
    expect(memberStepStatus({ mode: "FORM", answeredAt: null, notebookAt: null, answerPdfAt: null })).toEqual({ done: false, text: "να το γράψεις" });
    expect(memberStepStatus({ mode: "PDF_NOTEBOOK", answeredAt: t, notebookAt: t, answerPdfAt: null }).done).toBe(true);
    expect(memberStepStatus({ mode: "PDF_FILL", answeredAt: null, notebookAt: null, answerPdfAt: null })).toEqual({ done: false, text: "να το συμπληρώσεις" });
    expect(memberStepStatus({ mode: "PDF_FILL", answeredAt: null, notebookAt: null, answerPdfAt: t }).text).toBe("✓ το ανέβασες");
  });
});
