import { describe, expect, it } from "vitest";
import { buildActions, STATE_LABEL, stateLine, type ActionInput, type ItemRow } from "./actions-core";

const d = (s: string) => new Date(s);
const base: ActionInput = {
  memberId: "m1", memberName: "Νίκος Δ.", riskTrigger: null, initialAssessmentMissing: null, cycleReviewDue: null, care: [], help: [], items: [],
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
    const [a] = buildActions({ ...base, care: [{ id: "c1", kind: "dropout", dueAt: d("2026-10-11T09:00:00Z"), createdAt: d("2026-10-11T09:00:00Z"), doneAt: d("2026-10-12T09:00:00Z"), doneByName: "Εύα", claimedByName: "Εύα", claimedAt: d("2026-10-11T10:00:00Z"), note: "μιλήσαμε" }] });
    expect(a.state).toBe("done");
    expect(stateLine(a, fmt)).toBe("Ολοκληρώθηκε από Εύα · 2026-10-12");
  });
  it("τα σήματα δεν γίνονται ενέργειες με ανάληψη· το τηλεφώνημα της διαχείρισης είναι ενέργεια μόνο της διαχείρισης", () => {
    expect(buildActions(base)).toEqual([]);
    const [a] = buildActions({ ...base, care: [{ id: "c2", kind: "dropout", dueAt: d("2026-10-11T09:00:00Z"), createdAt: d("2026-10-11T09:00:00Z"), doneAt: null, doneByName: null, claimedByName: null, claimedAt: null, note: "" }] });
    expect(a).toMatchObject({ kind: "admin_contact", title: "Τηλεφωνική επικοινωνία από τη διαχείριση", adminOnly: true, state: "unclaimed", ownerRule: "η διαχείριση" });
    expect(a.detail).toContain("δεν κλείνει το σήμα");
  });
  it("βήμα που ολοκλήρωσε το μέλος (17/10): ενέργεια για όποιον θεραπευτή το αναλάβει, κλείνει με «Το διάβασα»", () => {
    const [a] = buildActions({ ...base, stepsToRead: [{ id: "as1", title: "Βήμα 1 · Παραδοχή", step: 1, answeredAt: d("2026-10-16T18:00:00Z") }] });
    expect(a).toMatchObject({ kind: "step_read", ref: "assignment:as1", state: "unclaimed", manualDone: true, doneLabel: "Το διάβασα", needsClinician: false, adminOnly: false, href: "/t/members/m1/assignments" });
    expect(a.title).toBe("Βήμα 1 — το μέλος το ολοκλήρωσε, να το διαβάσει ένας θεραπευτής");
    expect(a.createdAt?.toISOString()).toBe("2026-10-16T18:00:00.000Z");
    const row: ItemRow = { memberId: "m1", kind: "step_read", ref: "assignment:as1", createdAt: d("2026-10-16T18:00:00Z"), dueAt: null, claimedByName: "Άννα Κ.", claimedAt: d("2026-10-17T08:00:00Z"), doneAt: d("2026-10-17T09:00:00Z"), doneByName: "Άννα Κ.", doneNote: "" };
    expect(buildActions({ ...base, stepsToRead: [{ id: "as1", title: "x", step: 1, answeredAt: d("2026-10-16T18:00:00Z") }], items: [row] })[0].state).toBe("done");
    const [e] = buildActions({ ...base, stepsToRead: [{ id: "as2", title: "Η εβδομάδα μου", step: null, answeredAt: d("2026-10-16T18:00:00Z") }] });
    expect(e.title).toContain("Εργασία «Η εβδομάδα μου»");
  });
  it("νέος κύκλος μετά το αυτόματο κλείσιμο (17/10): ενέργεια μόνο της διαχείρισης, χωρίς «δεν κλείνει το σήμα»", () => {
    const [a] = buildActions({ ...base, care: [{ id: "c3", kind: "new_cycle", dueAt: d("2026-10-17T09:00:00Z"), createdAt: d("2026-10-17T09:00:00Z"), doneAt: null, doneByName: null, claimedByName: null, claimedAt: null, note: "" }] });
    expect(a).toMatchObject({ kind: "admin_contact", adminOnly: true, manualDone: true, ownerRule: "η διαχείριση" });
    expect(a.title).toContain("συμφωνητικό και προεξόφληση");
    expect(a.detail).not.toContain("δεν κλείνει το σήμα");
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
