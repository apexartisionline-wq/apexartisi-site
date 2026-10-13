/**
 * Παρουσία σε ατομική / Therapair — ένας κοινός ορισμός για όλες τις οθόνες (Σήμερα, ατομική, φάκελος, Συνέπεια, κύκλος).
 *
 * Τι ξέρουμε πραγματικά για μια κράτηση:
 *  - `joinedAt`: γράφεται όταν το μέλος πατά «Μπες» (ώρα πατήματος, ΟΧΙ επιβεβαίωση από το Zoom)
 *    ή όταν ο θεραπευτής γράφει σημείωμα «Ήρθε» (τότε γράφεται η ώρα έναρξης).
 *  - σημείωμα: «Δεν ήρθε» σβήνει το `joinedAt` και γράφει σημείωμα· «Ήρθε» το ορίζει.
 *
 * Άρα, με σημείωμα: `joinedAt` ⇒ επιβεβαιωμένη παρουσία, κενό ⇒ επιβεβαιωμένη απουσία.
 * Χωρίς σημείωμα: `joinedAt` ⇒ «πάτησε Μπες» (δεν είναι ακόμα επιβεβαίωση), κενό ⇒ ΧΩΡΙΣ ΚΑΤΑΓΡΑΦΗ.
 * Η έλλειψη καταγραφής ΔΕΝ είναι επιβεβαιωμένη απουσία.
 *
 * Ο υπάρχων αριθμητικός κανόνας ΔΕΝ άλλαξε: «ήρθε» = επιβεβαιωμένη παρουσία + «πάτησε Μπες»·
 * όσα δεν έχουν καταγραφή μετράνε στον παρονομαστή και όχι στον αριθμητή (όπως πάντα).
 * Η διαφορά είναι ότι τώρα φαίνονται ξεχωριστά και δεν ονομάζονται «απουσία».
 *
 * Ακυρωμένη συνεδρία: η ακύρωση διαγράφει την κράτηση (η ώρα ελευθερώνεται), οπότε δεν υπάρχει τέτοια κατάσταση στα δεδομένα.
 */
export type Presence =
  | "future" // δεν έχει φτάσει η ώρα
  | "in_progress" // μέσα στο προγραμματισμένο διάστημα
  | "present_note" // σημείωμα «Ήρθε» — επιβεβαιωμένη παρουσία
  | "join_clicked" // πάτησε «Μπες», χωρίς σημείωμα ακόμα
  | "absent_note" // σημείωμα «Δεν ήρθε» — επιβεβαιωμένη απουσία
  | "no_record"; // πέρασε η ώρα, ούτε «Μπες» ούτε σημείωμα

export function sessionPresence(i: {
  startsAt: Date;
  endsAt: Date;
  now: Date;
  joinedAt: Date | null;
  hasNote: boolean;
}): Presence {
  if (i.startsAt > i.now) return "future";
  if (i.hasNote) return i.joinedAt ? "present_note" : "absent_note";
  if (i.joinedAt) return "join_clicked";
  return i.endsAt > i.now ? "in_progress" : "no_record";
}

/** Μετράει ως «ήρθε» στους υπάρχοντες αριθμούς (ίδιος κανόνας με πριν: υπάρχει joinedAt). */
export const countsAsCame = (p: Presence) => p === "present_note" || p === "join_clicked";

/** Λέξεις προς τον θεραπευτή. `tone` ταιριάζει με τις κλάσεις `.pill`. */
export const PRESENCE_LABEL: Record<Presence, { word: string; source: string; tone: "ok" | "yellow" | "grey" | "accent" | "" }> = {
  future: { word: "μελλοντική", source: "δεν έχει φτάσει η ώρα · δεν μετράει", tone: "grey" },
  in_progress: { word: "σε εξέλιξη", source: "μέσα στην προγραμματισμένη ώρα", tone: "accent" },
  present_note: { word: "ήρθε", source: "επιβεβαιώθηκε με σημείωμα «Ήρθε»", tone: "ok" },
  join_clicked: { word: "πάτησε «Μπες»", source: "ώρα πατήματος· εκκρεμεί σημείωμα που να το επιβεβαιώνει", tone: "ok" },
  absent_note: { word: "δεν ήρθε", source: "επιβεβαιώθηκε με σημείωμα «Δεν ήρθε»", tone: "yellow" },
  no_record: { word: "χωρίς καταγραφή", source: "πέρασε η ώρα· ούτε «Μπες» ούτε σημείωμα", tone: "yellow" },
};

export type PresenceCounts = {
  scheduled: number; // όσες έχουν προγραμματιστεί
  timePassed: number; // όσων πέρασε η προγραμματισμένη ώρα (όχι «έγιναν»)
  upcoming: number;
  confirmedPresent: number;
  joinClicked: number;
  confirmedAbsent: number;
  noRecord: number; // άγνωστη κατάσταση
  counted: number; // «ήρθε» κατά τον υπάρχοντα κανόνα
};

export function countPresence(ps: Presence[]): PresenceCounts {
  const n = (p: Presence) => ps.filter((x) => x === p).length;
  const upcoming = n("future");
  return {
    scheduled: ps.length,
    timePassed: ps.length - upcoming,
    upcoming,
    confirmedPresent: n("present_note"),
    joinClicked: n("join_clicked"),
    confirmedAbsent: n("absent_note"),
    noRecord: n("no_record") + n("in_progress"),
    counted: n("present_note") + n("join_clicked"),
  };
}

/** Μία γραμμή με την ανάλυση, μόνο για ό,τι υπάρχει: «2 με σημείωμα «Ήρθε» · 1 πάτησε «Μπες» χωρίς σημείωμα · 1 χωρίς καταγραφή». */
export function describeCounts(c: PresenceCounts): string {
  const parts: string[] = [];
  if (c.confirmedPresent) parts.push(`${c.confirmedPresent} με σημείωμα «Ήρθε»`);
  if (c.joinClicked) parts.push(`${c.joinClicked} πάτησε «Μπες» χωρίς σημείωμα`);
  if (c.confirmedAbsent) parts.push(`${c.confirmedAbsent} σημείωμα «Δεν ήρθε»`);
  if (c.noRecord) parts.push(`${c.noRecord} χωρίς καταγραφή`);
  return parts.join(" · ");
}

/** Περίοδος ανοιχτού κύκλου: όχι «13/10–13/10» όταν ο κύκλος μόλις ξεκίνησε και είναι σε εξέλιξη. */
export function periodLabel(fromLabel: string, toLabel: string | null, open: boolean): string {
  if (open) return `Από ${fromLabel} — σε εξέλιξη`;
  return toLabel && toLabel !== fromLabel ? `${fromLabel} – ${toLabel}` : fromLabel;
}
