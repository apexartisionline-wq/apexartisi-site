/**
 * Παρουσία σε ατομική / Therapair — ένας κοινός ορισμός για όλες τις οθόνες (Σήμερα, ατομική, φάκελος, Συνέπεια, κύκλος, μήνας).
 * Απόφαση υπεύθυνης 13/10 (διευκρινίσεις μετά το 2ο πέρασμα):
 *
 *  - Το πάτημα «Μπες» ΑΠΟ ΤΟ ΜΕΛΟΣ (`Booking.joinedAt`) μετράει ως παρουσία πριν γραφτεί το σημείωμα, με πηγή «Από σύνδεση».
 *    Το πάτημα του θεραπευτή (`StaffJoin`) δεν καταγράφει παρουσία του μέλους.
 *  - Αν ο θεραπευτής καταγράψει ρητά «Ήρθε» ή «Δεν ήρθε» (`Booking.confirmedCame`, από το σημείωμα), αυτή η επιβεβαίωση
 *    υπερισχύει. Το αρχικό πάτημα ΔΕΝ σβήνεται: μένει στο `joinedAt` και στο ιστορικό.
 *  - Χωρίς πάτημα ή επιβεβαίωση: «Χωρίς καταγραφή», όχι «Επιβεβαιωμένη απουσία».
 *  - Οι λέξεις «Από σύνδεση» και «Χωρίς καταγραφή» εγκρίθηκαν από την υπεύθυνη (13/10)· να μην αλλάξουν χωρίς ερώτηση.
 *  - Παρονομαστής: οι προγραμματισμένες που πέρασαν (έληξε η ώρα τους) — ή που έχουν ήδη καταγραφή.
 *  - Ακυρωμένη ατομική: η ακύρωση διαγράφει την κράτηση, οπότε δεν μπαίνει ποτέ στον παρονομαστή.
 */
export type Presence =
  | "future" // δεν έχει φτάσει η ώρα
  | "in_progress" // μέσα στο προγραμματισμένο διάστημα, χωρίς καταγραφή ακόμα
  | "present_confirmed" // ο θεραπευτής κατέγραψε «Ήρθε»
  | "present_join" // το μέλος πάτησε «Μπες» (πηγή «Από σύνδεση»), χωρίς επιβεβαίωση ακόμα
  | "absent_confirmed" // ο θεραπευτής κατέγραψε «Δεν ήρθε»
  | "no_record"; // έληξε η ώρα, ούτε πάτημα ούτε επιβεβαίωση

export type PresenceInput = {
  startsAt: Date;
  endsAt: Date;
  now: Date;
  joinedAt: Date | null; // πάτημα «Μπες» από το μέλος
  confirmedCame: boolean | null | undefined; // επιβεβαίωση θεραπευτή (σημείωμα)
};

export function sessionPresence(i: PresenceInput): Presence {
  if (i.confirmedCame === true) return "present_confirmed";
  if (i.confirmedCame === false) return "absent_confirmed";
  if (i.joinedAt) return "present_join";
  if (i.startsAt > i.now) return "future";
  return i.endsAt > i.now ? "in_progress" : "no_record";
}

/** Μετράει ως παρουσία: επιβεβαίωση «Ήρθε», ή πάτημα «Μπες» του μέλους χωρίς αντίθετη επιβεβαίωση. */
export const countsAsCame = (p: Presence) => p === "present_confirmed" || p === "present_join";

/** Το ίδιο, για εγγραφές της βάσης (χωρίς ώρες). */
export const bookingCame = (b: { joinedAt: Date | null; confirmedCame: boolean | null | undefined }) =>
  b.confirmedCame === true || (b.confirmedCame !== false && Boolean(b.joinedAt));

/** Μπαίνει στον παρονομαστή: έληξε η ώρα της, ή έχει ήδη καταγραφή (πάτημα ή επιβεβαίωση). */
export const inDenominator = (p: Presence) => p !== "future" && p !== "in_progress";

/** Λέξεις προς τον θεραπευτή. `tone` ταιριάζει με τις κλάσεις `.pill`. */
export const PRESENCE_LABEL: Record<Presence, { word: string; source: string; tone: "ok" | "yellow" | "grey" | "accent" | "" }> = {
  future: { word: "μελλοντική", source: "δεν έχει φτάσει η ώρα · δεν μετράει ακόμα", tone: "grey" },
  in_progress: { word: "σε εξέλιξη", source: "μέσα στην προγραμματισμένη ώρα · δεν μετράει ακόμα", tone: "accent" },
  present_confirmed: { word: "παρουσία", source: "Επιβεβαίωση θεραπευτή (σημείωμα «Ήρθε»)", tone: "ok" },
  present_join: { word: "παρουσία", source: "Από σύνδεση (το μέλος πάτησε «Μπες»)", tone: "ok" },
  absent_confirmed: { word: "δεν ήρθε", source: "Επιβεβαίωση θεραπευτή (σημείωμα «Δεν ήρθε»)", tone: "yellow" },
  no_record: { word: "χωρίς καταγραφή", source: "έληξε η ώρα · ούτε σύνδεση ούτε επιβεβαίωση", tone: "yellow" },
};

/** Η ίδια μονάδα σε όλες τις οθόνες (απόφαση 13/10). */
export const PRESENCE_UNIT = "παρουσίες / προγραμματισμένες που πέρασαν";
/** Μία γραμμή κάτω από τα κουτάκια αριθμών. */
export const PRESENCE_HINT = "Χ/Υ = παρουσίες / προγραμματισμένες που πέρασαν. «Χωρίς καταγραφή» δεν σημαίνει απουσία.";

export type PresenceCounts = {
  scheduled: number; // όσες έχουν προγραμματιστεί (και μελλοντικές)
  timePassed: number; // παρονομαστής: προγραμματισμένες που πέρασαν
  upcoming: number; // μελλοντικές ή σε εξέλιξη χωρίς καταγραφή (δεν μετράνε)
  confirmedPresent: number;
  joinClicked: number; // «Από σύνδεση»
  confirmedAbsent: number;
  noRecord: number; // άγνωστη κατάσταση
  counted: number; // παρουσίες = confirmedPresent + joinClicked
};

export function countPresence(ps: Presence[]): PresenceCounts {
  const n = (p: Presence) => ps.filter((x) => x === p).length;
  const upcoming = n("future") + n("in_progress");
  return {
    scheduled: ps.length,
    timePassed: ps.length - upcoming,
    upcoming,
    confirmedPresent: n("present_confirmed"),
    joinClicked: n("present_join"),
    confirmedAbsent: n("absent_confirmed"),
    noRecord: n("no_record"),
    counted: n("present_confirmed") + n("present_join"),
  };
}

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** «3 παρουσίες / 5 προγραμματισμένες που πέρασαν · 2 χωρίς καταγραφή» (και ό,τι άλλο υπάρχει). */
export function describeCounts(c: PresenceCounts): string {
  if (c.timePassed === 0) return c.upcoming > 0 ? "καμία δεν έχει περάσει ακόμα" : "";
  const parts = [`${plural(c.counted, "παρουσία", "παρουσίες")} / ${plural(c.timePassed, "προγραμματισμένη που πέρασε", "προγραμματισμένες που πέρασαν")}`];
  if (c.noRecord) parts.push(`${c.noRecord} χωρίς καταγραφή`);
  if (c.confirmedAbsent) parts.push(`${c.confirmedAbsent} «Δεν ήρθε» (επιβεβαίωση)`);
  return parts.join(" · ");
}

/** Πηγή των παρουσιών: «2 από σύνδεση · 1 με επιβεβαίωση». */
export function describeSources(c: PresenceCounts): string {
  const parts: string[] = [];
  if (c.confirmedPresent) parts.push(`${c.confirmedPresent} με επιβεβαίωση θεραπευτή`);
  if (c.joinClicked) parts.push(`${c.joinClicked} από σύνδεση`);
  return parts.join(" · ");
}

/** Περίοδος ανοιχτού κύκλου: όχι «13/10–13/10» όταν ο κύκλος μόλις ξεκίνησε και είναι σε εξέλιξη. */
export function periodLabel(fromLabel: string, toLabel: string | null, open: boolean): string {
  if (open) return `Από ${fromLabel} — σε εξέλιξη`;
  return toLabel && toLabel !== fromLabel ? `${fromLabel} – ${toLabel}` : fromLabel;
}
