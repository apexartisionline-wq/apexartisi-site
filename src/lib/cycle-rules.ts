/**
 * Πότε «τελείωσε» ένας κύκλος (απόφαση υπεύθυνης 14/10): όταν έχουν γίνει ΚΑΙ οι ατομικές του (όλες οι προβλεπόμενες
 * προγραμματίστηκαν και πέρασε η ώρα τους) ΚΑΙ οι ομάδες του (όσες προβλέπει ο κύκλος, π.χ. 16, πέρασαν από την έναρξή
 * του — όχι «παρουσίες», αλλά ομάδες του πραγματικού προγράμματος που έληξαν). Μόνο τότε ανοίγει το κλείσιμο/αρχειοθέτηση.
 * Καθαρή λογική, χωρίς βάση.
 */
export type CycleProgress = { sessionsPassed: number; sessionsTotal: number; groupsPassed: number; groupsTotal: number };

export function cycleIsComplete(p: CycleProgress): boolean {
  return p.sessionsPassed >= p.sessionsTotal && p.groupsPassed >= p.groupsTotal;
}

/** «6 από 8 ατομικές · 12 από 16 ομάδες έχουν περάσει» */
export function describeCycleProgress(p: CycleProgress): string {
  return `${Math.min(p.sessionsPassed, p.sessionsTotal)} από ${p.sessionsTotal} ατομικές · ${Math.min(p.groupsPassed, p.groupsTotal)} από ${p.groupsTotal} ομάδες έχουν περάσει`;
}
