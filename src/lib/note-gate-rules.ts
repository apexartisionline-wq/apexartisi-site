/**
 * Πύλη «Εκκρεμεί σημείωμα» (υπεύθυνη 17/10: «δεν θέλω να αφήσουμε περιθώριο να έχει γίνει ατομική και να μην έχει ολοκληρωθεί
 * το σημείωμα της ατομικής από τον θεραπευτή»). Καθαρή λογική, χωρίς βάση, ώστε να δοκιμάζεται.
 *
 * Κανόνας: αν ο θεραπευτής έχει ατομική ή Therapair που ΤΕΛΕΙΩΣΕ (πέρασε η ώρα λήξης) τις τελευταίες NOTE_GATE_DAYS μέρες
 * χωρίς σημείωμα («Ήρθε» ή «Δεν ήρθε» — το ολοκληρωμένο ιστορικό της 1ης ατομικής μετρά ως σημείωμα), δεν μπορεί να
 * συνεχίσει πουθενά αλλού στο Apex μέχρι να το γράψει. Εξαίρεση: όσο έχει άλλη συνεδρία ή ομάδα ΣΕ ΕΞΕΛΙΞΗ (από το άνοιγμα
 * της εισόδου ως τη λήξη της), ώστε να μην κλειδωθεί ανάμεσα σε δύο συνεχόμενες συνεδρίες. Το κόκκινο κουμπί, ο «Λογαριασμός»
 * και οι ίδιες οι σελίδες των εκκρεμών συνεδριών μένουν πάντα ανοιχτά. Η διαχείριση δεν κλειδώνεται — βλέπει τη λίστα.
 */
export const NOTE_GATE_DAYS = 7;
/** Από πότε ισχύει (ώρα Ελλάδας): όχι αναδρομικά — οι συνεδρίες πριν από αυτή τη μέρα δεν κλειδώνουν (μένουν στις «Εκκρεμότητες»). */
export const NOTE_GATE_FROM = "2026-10-17";

export type GateSlot = { id: string; kind: "INDIVIDUAL" | "PAIR"; startsAt: Date; hasNote: boolean; who: string; demo?: boolean };
export type GateInput = {
  now: Date;
  slots: GateSlot[]; // οι συνεδρίες του θεραπευτή (με κράτηση) των τελευταίων ημερών, και οι σημερινές/επόμενες για το «σε εξέλιξη»
  groups: { startsAt: Date; endsAt: Date }[]; // ομάδες που συντονίζει (για το «σε εξέλιξη»)
  sessionMinutes: number;
  pairMinutes: number;
  joinBeforeMinutes: number;
  excludeDemo?: boolean; // στη δοκιμή: τα ψεύτικα ραντεβού της ημέρας δεν κλειδώνουν
  days?: number;
  from?: Date; // έναρξη ισχύος (NOTE_GATE_FROM)
};
export type PendingNote = { id: string; kind: "INDIVIDUAL" | "PAIR"; startsAt: Date; endsAt: Date; who: string };

export function noteGate(i: GateInput): { pending: PendingNote[]; inProgress: boolean; blocked: boolean } {
  const days = i.days ?? NOTE_GATE_DAYS;
  const since = i.now.getTime() - days * 86_400_000;
  const endOf = (s: GateSlot) => new Date(s.startsAt.getTime() + (s.kind === "PAIR" ? i.pairMinutes : i.sessionMinutes) * 60_000);
  // Στη δοκιμή τα ψεύτικα ραντεβού της ημέρας δεν μετρούν πουθενά: ούτε κλειδώνουν ούτε «τρέχουν».
  const real = i.slots.filter((s) => !(i.excludeDemo && s.demo));
  const pending = real
    .filter((s) => !s.hasNote && s.startsAt.getTime() >= since && (!i.from || s.startsAt >= i.from) && endOf(s) <= i.now)
    .map((s) => ({ id: s.id, kind: s.kind, startsAt: s.startsAt, endsAt: endOf(s), who: s.who }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const open = (start: Date) => start.getTime() - i.joinBeforeMinutes * 60_000 <= i.now.getTime();
  const inProgress =
    real.some((s) => open(s.startsAt) && endOf(s) > i.now) ||
    i.groups.some((g) => open(g.startsAt) && g.endsAt > i.now);
  return { pending, inProgress, blocked: pending.length > 0 && !inProgress };
}
