/**
 * Ομάδες ανά μέλος (απόφαση 13/10): μία ομάδα μπαίνει στον παρονομαστή όταν ήταν στο πραγματικό πρόγραμμα, έληξε η ώρα της,
 * είναι από την ένταξη του μέλους και μετά — ακόμη κι αν δεν υπάρχει καταγραφή παρουσίας. Οι ομάδες δεν ακυρώνονται εκ των προτέρων
 * (υπεύθυνη 13/10)· αν τελικά δεν έγινε, ο συντονιστής ή η διαχείριση το σημειώνει εκ των υστέρων (απόφαση 14/10) και βγαίνει
 * από τον παρονομαστή όλων («δεν έγινε», ούτε παρουσία ούτε «χωρίς καταγραφή»).
 * Παρουσία = «Μπες στην ομάδα» ή διόρθωση της διαχείρισης (Attendance). Χωρίς καταγραφή = «Χωρίς καταγραφή», όχι απουσία.
 * Ομάδα με καταγεγραμμένη παρουσία μετράει αμέσως (και στον αριθμητή και στον παρονομαστή).
 * Καθαρή λογική, χωρίς βάση.
 */
export type Occurrence = { date: string; time: string; startsAt: Date; endsAt: Date; notHeld?: boolean };
export type GroupState = "present" | "no_record" | "future" | "before_join" | "not_held";

export const GROUP_LABEL: Record<GroupState, string> = {
  present: "παρουσία",
  no_record: "χωρίς καταγραφή",
  future: "δεν έχει τελειώσει ακόμα",
  before_join: "πριν από την ένταξη",
  not_held: "δεν έγινε",
};

export function memberGroups(occ: Occurrence[], attendance: { date: string; joinedAt: Date }[], o: { now: Date; joinDate: string | null }) {
  const sorted = [...occ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const matched = new Set<Occurrence>();
  // Κάθε παρουσία (μία ανά μέρα) πάει στην ομάδα της μέρας που ταιριάζει στην ώρα· αλλιώς στην πρώτη της μέρας.
  for (const a of attendance) {
    const same = sorted.filter((g) => g.date === a.date && !matched.has(g));
    if (same.length === 0) continue; // παρουσία σε μέρα χωρίς ομάδα στο πρόγραμμα: δεν μετράει
    const t = a.joinedAt.getTime();
    const near = same.find((g) => t >= g.startsAt.getTime() - 3 * 3600_000 && t <= g.endsAt.getTime() + 3 * 3600_000);
    matched.add(near ?? same[0]);
  }
  const rows = sorted.map((g) => {
    let state: GroupState;
    if (o.joinDate && g.date < o.joinDate) state = "before_join";
    else if (g.notHeld) state = "not_held";
    else if (matched.has(g)) state = "present";
    else if (g.endsAt <= o.now) state = "no_record";
    else state = "future";
    return { ...g, state };
  });
  const counted = rows.filter((r) => r.state === "present").length;
  const noRecord = rows.filter((r) => r.state === "no_record").length;
  return { rows, counted, noRecord, passed: counted + noRecord, upcoming: rows.filter((r) => r.state === "future").length };
}

/** «3 παρουσίες / 5 προγραμματισμένες που πέρασαν · 2 χωρίς καταγραφή». */
export function describeGroups(c: { counted: number; passed: number; noRecord: number }): string {
  if (c.passed === 0) return "καμία ομάδα δεν έχει περάσει ακόμα";
  const one = (k: number, a: string, b: string) => `${k} ${k === 1 ? a : b}`;
  return [`${one(c.counted, "παρουσία", "παρουσίες")} / ${one(c.passed, "προγραμματισμένη που πέρασε", "προγραμματισμένες που πέρασαν")}`, c.noRecord ? `${c.noRecord} χωρίς καταγραφή` : ""].filter(Boolean).join(" · ");
}
