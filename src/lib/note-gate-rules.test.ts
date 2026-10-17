import { describe, expect, it } from "vitest";
import { noteGate, type GateInput } from "./note-gate-rules";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const base: GateInput = { now, slots: [], groups: [], sessionMinutes: 40, pairMinutes: 60, joinBeforeMinutes: 15 };

describe("πύλη «Εκκρεμεί σημείωμα» (17/10)", () => {
  it("τίποτα χωρίς συνεδρίες· συνεδρία που τελείωσε χωρίς σημείωμα κλειδώνει", () => {
    expect(noteGate(base).blocked).toBe(false);
    const g = noteGate({ ...base, slots: [{ id: "a", kind: "INDIVIDUAL", startsAt: ago(120), hasNote: false, who: "Νίκος Δ." }] });
    expect(g.blocked).toBe(true);
    expect(g.pending.map((p) => p.id)).toEqual(["a"]);
    expect(g.pending[0].endsAt.toISOString()).toBe(ago(80).toISOString());
  });
  it("με σημείωμα δεν κλειδώνει· συνεδρία που δεν τελείωσε ακόμα δεν μετρά", () => {
    expect(noteGate({ ...base, slots: [{ id: "a", kind: "INDIVIDUAL", startsAt: ago(120), hasNote: true, who: "x" }] }).blocked).toBe(false);
    expect(noteGate({ ...base, slots: [{ id: "a", kind: "INDIVIDUAL", startsAt: ago(30), hasNote: false, who: "x" }] }).pending).toEqual([]);
  });
  it("Therapair μετρά με τη δική του διάρκεια (60′)", () => {
    expect(noteGate({ ...base, slots: [{ id: "p", kind: "PAIR", startsAt: ago(50), hasNote: false, who: "x" }] }).pending).toEqual([]);
    expect(noteGate({ ...base, slots: [{ id: "p", kind: "PAIR", startsAt: ago(61), hasNote: false, who: "x" }] }).pending).toHaveLength(1);
  });
  it("όσο τρέχει άλλη συνεδρία (από το άνοιγμα της εισόδου) ή ομάδα, η πύλη δεν κλειδώνει — μένει η εκκρεμότητα", () => {
    const pendingSlot = { id: "a", kind: "INDIVIDUAL" as const, startsAt: ago(120), hasNote: false, who: "x" };
    const g1 = noteGate({ ...base, slots: [pendingSlot, { id: "b", kind: "INDIVIDUAL", startsAt: ago(-10), hasNote: false, who: "y" }] });
    expect(g1.inProgress).toBe(true); expect(g1.blocked).toBe(false); expect(g1.pending).toHaveLength(1);
    const g2 = noteGate({ ...base, slots: [pendingSlot], groups: [{ startsAt: ago(-5), endsAt: ago(-95) }] });
    expect(g2.blocked).toBe(false);
    const g3 = noteGate({ ...base, slots: [pendingSlot, { id: "b", kind: "INDIVIDUAL", startsAt: ago(-30), hasNote: false, who: "y" }] });
    expect(g3.blocked).toBe(true); // η επόμενη ανοίγει σε 15′ — ακόμα δεν τρέχει
  });
  it("όχι αναδρομικά: συνεδρίες πριν την έναρξη ισχύος δεν κλειδώνουν", () => {
    const slot = { id: "a", kind: "INDIVIDUAL" as const, startsAt: ago(120), hasNote: false, who: "x" };
    expect(noteGate({ ...base, slots: [slot], from: new Date("2026-10-18T00:00:00Z") }).blocked).toBe(false);
    expect(noteGate({ ...base, slots: [slot], from: new Date("2026-10-17T00:00:00Z") }).blocked).toBe(true);
  });
  it("παλιότερες από 7 μέρες δεν κλειδώνουν· στη δοκιμή τα ψεύτικα ραντεβού εξαιρούνται", () => {
    expect(noteGate({ ...base, slots: [{ id: "old", kind: "INDIVIDUAL", startsAt: ago(8 * 24 * 60), hasNote: false, who: "x" }] }).blocked).toBe(false);
    expect(noteGate({ ...base, excludeDemo: true, slots: [{ id: "d", kind: "INDIVIDUAL", startsAt: ago(120), hasNote: false, who: "x", demo: true }] }).blocked).toBe(false);
    // …ούτε μετρούν ως «σε εξέλιξη»: η πραγματική εκκρεμότητα κλειδώνει κανονικά.
    expect(noteGate({ ...base, excludeDemo: true, slots: [{ id: "a", kind: "INDIVIDUAL", startsAt: ago(120), hasNote: false, who: "x" }, { id: "d", kind: "INDIVIDUAL", startsAt: ago(-5), hasNote: false, who: "y", demo: true }] }).blocked).toBe(true);
    expect(noteGate({ ...base, excludeDemo: false, slots: [{ id: "d", kind: "INDIVIDUAL", startsAt: ago(120), hasNote: false, who: "x", demo: true }] }).blocked).toBe(true);
  });
});
