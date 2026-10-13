import { describe, expect, it } from "vitest";
import { buildActions, STATE_LABEL, stateLine, type ActionInput, type ItemRow } from "./actions-core";

const d = (s: string) => new Date(s);
const base: ActionInput = {
  memberId: "m1", memberName: "Νίκος Δ.", riskTrigger: null, redSignals: [], initialAssessmentMissing: null, cycleReviewDue: null, care: [], help: [], items: [],
};
const fmt = (x: Date) => x.toISOString().slice(0, 10);

describe("επόμενες ενέργειες", () => {
  it("νέα ενέργεια: εκκρεμεί ανάληψη, με ημερομηνία δημιουργίας και ποιος την κάνει κατά τους κανόνες", () => {
    const [a] = buildActions({ ...base, riskTrigger: { at: d("2026-10-11T09:00:00Z"), text: "κόκκινο κουμπί" } });
    expect(a).toMatchObject({ kind: "safety_assessment", state: "unclaimed", needsClinician: true, claimedBy: null, doneAt: null, dueAt: null });
    expect(a.createdAt?.toISOString()).toBe("2026-10-11T09:00:00.000Z");
    expect(STATE_LABEL[a.state]).toBe("Εκκρεμεί ανάληψη");
    expect(stateLine(a, fmt)).toBe("κατά τους κανόνες: ψυχολόγος");
  });
  it("η ανάληψη ονομάζει ποιος και πότε, χωρίς να ολοκληρώνει", () => {
    const row: ItemRow = { memberId: "m1", kind: "safety_assessment", ref: "risk:2026-10-11T09:00:00.000Z", createdAt: d("2026-10-12T00:00:00Z"), dueAt: null, claimedByName: "Δήμητρα Λ.", claimedAt: d("2026-10-12T08:00:00Z"), doneAt: null, doneByName: null, doneNote: "" };
    const [a] = buildActions({ ...base, riskTrigger: { at: d("2026-10-11T09:00:00Z"), text: "κόκκινο κουμπί" }, items: [row] });
    expect(a.state).toBe("claimed");
    expect(stateLine(a, fmt)).toBe("Έχει αναληφθεί από Δήμητρα Λ. · 2026-10-12");
  });
  it("ολοκληρωμένη ενέργεια δείχνει ποιος και πότε", () => {
    const row: ItemRow = { memberId: "m1", kind: "signal_followup", ref: "signal:2026-10-11T10:00:00.000Z", createdAt: d("2026-10-11T10:00:00Z"), dueAt: null, claimedByName: "Άννα Κ.", claimedAt: d("2026-10-11T11:00:00Z"), doneAt: d("2026-10-12T09:00:00Z"), doneByName: "Άννα Κ.", doneNote: "" };
    const [a] = buildActions({ ...base, redSignals: [{ text: "Έγραψε στο ημερολόγιο", at: d("2026-10-11T10:00:00Z") }], items: [row] });
    expect(a.state).toBe("done");
    expect(stateLine(a, fmt)).toBe("Ολοκληρώθηκε από Άννα Κ. · 2026-10-12");
  });
  it("νέο σήμα μετά την ολοκλήρωση δημιουργεί νέα ενέργεια (ο παλιός κλειστός κύκλος δεν την κρύβει)", () => {
    const old: ItemRow = { memberId: "m1", kind: "signal_followup", ref: "signal:2026-10-11T10:00:00.000Z", createdAt: d("2026-10-11T10:00:00Z"), dueAt: null, claimedByName: "Άννα Κ.", claimedAt: d("2026-10-11T11:00:00Z"), doneAt: d("2026-10-12T09:00:00Z"), doneByName: "Άννα Κ.", doneNote: "" };
    const [a] = buildActions({ ...base, redSignals: [{ text: "Νέο σήμα", at: d("2026-10-13T10:00:00Z") }], items: [old] });
    expect(a.state).toBe("unclaimed");
  });
  it("προθεσμία φαίνεται μόνο όταν υπάρχει (μήνυμα φροντίδας) και όχι επινοημένη", () => {
    const out = buildActions({ ...base, riskTrigger: { at: d("2026-10-11T09:00:00Z"), text: "ημερολόγιο" }, care: [{ id: "c1", kind: "caring_24h", dueAt: d("2026-10-12T09:00:00Z"), createdAt: d("2026-10-11T09:00:00Z"), doneAt: null, doneByName: null, claimedByName: null, claimedAt: null, note: "" }] });
    expect(out.find((x) => x.kind === "safety_assessment")?.dueAt).toBeNull();
    expect(out.find((x) => x.kind === "care")?.dueAt?.toISOString()).toBe("2026-10-12T09:00:00.000Z");
  });
  it("κόκκινο κουμπί: χωρίς ανάληψη εκκρεμεί, με «μίλησαν» ολοκληρώθηκε από όποιον το ανέλαβε", () => {
    const [a] = buildActions({ ...base, help: [{ id: "h1", createdAt: d("2026-10-11T20:00:00Z"), claimedByName: null, claimedAt: null, talkedAt: null }] });
    expect(a.state).toBe("unclaimed");
    const [b] = buildActions({ ...base, help: [{ id: "h1", createdAt: d("2026-10-11T20:00:00Z"), claimedByName: "Βασίλης Μ.", claimedAt: d("2026-10-11T20:05:00Z"), talkedAt: d("2026-10-11T20:20:00Z") }] });
    expect(b).toMatchObject({ state: "done", doneBy: "Βασίλης Μ." });
  });
});
