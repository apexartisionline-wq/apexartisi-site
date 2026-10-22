/**
 * Η μέρα του μέλους ώρα-ώρα στο «Σήμερα» (υπεύθυνη 22/10: «το πρόγραμμα με βάση την ώρα», όπως ο πίνακας του site):
 * κείμενο, φόρμα, ατομικές, ημερολόγιο, ομάδες, με σειρά ώρας και ένδειξη «τώρα». Καθαρή συνάρτηση, χωρίς βάση.
 *
 * Καταστάσεις: `done` (✓ — μπήκε / συμπλήρωσε), `now` (γίνεται τώρα ή ανοίγει το κουμπί), `open` (βγήκε και περιμένει, π.χ.
 * το κείμενο ή το ημερολόγιο), `past` (πέρασε — ήπια, χωρίς κρίση), `later` (έρχεται).
 */
export type DayItem = {
  key: string;
  at: Date;
  /** Για ό,τι κρατά (ομάδα, ατομική): από πότε ανοίγει και πότε τελειώνει. Χωρίς αυτά είναι «στιγμή» (κείμενο, ημερολόγιο). */
  opensAt?: Date;
  endsAt?: Date;
  title: string;
  href?: string;
  done?: boolean;
};

export type DayState = "done" | "now" | "open" | "past" | "later";

export function dayTimeline(items: DayItem[], now: Date): { item: DayItem; state: DayState }[] {
  const t = now.getTime();
  return [...items]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((item) => {
      const start = (item.opensAt ?? item.at).getTime();
      if (t < start) return { item, state: "later" as const };
      if (item.done) return { item, state: "done" as const };
      if (!item.endsAt) return { item, state: "open" as const };
      return { item, state: t <= item.endsAt.getTime() ? ("now" as const) : ("past" as const) };
    });
}
