// Μήνυμα ενθάρρυνσης στο τέλος του «μήνα» (κύκλου). Μόνο θετικό πρόσημο: λέμε πόσο πάλεψε,
// δούλεψε, προσπάθησε — ποτέ τι δεν έκανε. Απλό πρότυπο από τα νούμερα (όχι AI)· το ελέγχει η υπεύθυνη.

export type Picture = {
  sessions: { came: number; total: number };
  groups: { came: number; total: number };
  journal: { written: number; days: number };
  soberDays: number | null;
  weeks: { text: string; yes: number; partly: number }[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function draftMessage(firstName: string, p: Picture): string {
  const lines: string[] = [`${firstName}, έκλεισε ένας ακόμα μήνας της δουλειάς σου μαζί μας.`];
  const did: string[] = [];
  if (p.groups.came > 0) did.push(`ήρθες σε ${plural(p.groups.came, "ομάδα", "ομάδες")}`);
  if (p.sessions.came > 0) did.push(`έκανες ${plural(p.sessions.came, "ατομική", "ατομικές")}`);
  if (p.journal.written > 0) did.push(`έγραψες απογραφές ${plural(p.journal.written, "βράδυ", "βράδια")}`);
  if (did.length) lines.push(`Αυτόν τον μήνα ${did.join(", ").replace(/, ([^,]*)$/, " και $1")}. Κάθε φορά που εμφανίστηκες ήταν μια επιλογή για τον εαυτό σου.`);
  const goalDays = p.weeks.reduce((s, w) => s + w.yes + w.partly, 0);
  if (p.weeks.length > 0) {
    lines.push(
      goalDays > 0
        ? `Έβαλες ${plural(p.weeks.length, "στόχο", "στόχους")} για τις εβδομάδες σου και δούλεψες πάνω τους ${plural(goalDays, "μέρα", "μέρες")}, όπως «${p.weeks[0].text}». Αυτό είναι δουλειά με τον εαυτό σου, μία μέρα τη φορά.`
        : `Έβαλες ${plural(p.weeks.length, "στόχο", "στόχους")} για τις εβδομάδες σου — το να ονομάζεις τι θέλεις να αλλάξεις είναι ήδη βήμα.`,
    );
  }
  if (p.soberDays && p.soberDays > 0) lines.push(`Είσαι ${plural(p.soberDays, "μέρα", "μέρες")} νηφάλιος/α. Το κράτησες με τη δική σου προσπάθεια.`);
  lines.push("Σε ευχαριστούμε για την εμπιστοσύνη. Συνεχίζουμε μαζί τον επόμενο μήνα — είμαστε εδώ.");
  lines.push("Η ομάδα του APEX");
  return lines.join("\n\n");
}
