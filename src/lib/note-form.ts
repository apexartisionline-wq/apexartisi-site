import { z } from "zod";

// Σημειωματάριο ατομικής, με τη σειρά που γράφει η ομάδα (βλ. CLAUDE.md, «Αποφάσεις»).
// Οι επιλογές είναι γρήγορες· κάθε ενότητα έχει και χώρο για δικά του λόγια.

export const PRESENTED = ["Ήρεμα", "Χαρούμενα", "Φορτισμένα", "Αγχωμένα", "Κλειστά", "Θυμωμένα", "Λυπημένα"] as const;
// Παλιές τιμές (πριν τις 10/10) που υπάρχουν σε αποθηκευμένα σημειώματα: μένουν έγκυρες, δεν προσφέρονται στη φόρμα.
const PRESENTED_LEGACY = ["Ήρεμος/η", "Χαρούμενος/η", "Φορτισμένος/η", "Αγχωμένος/η", "Κλειστός/ή", "Θυμωμένος/η", "Λυπημένος/η"] as const;
export const MOOD = ["Χαμηλή", "Μέτρια", "Καλή"] as const;
export const SELF_HELP = ["Δυσκολεύεται", "Κάνει βήματα, με διακυμάνσεις", "Φροντίζει ενεργά τον εαυτό του"] as const;
const SELF_HELP_LEGACY = ["Φροντίζει ενεργά τον εαυτό του/της"] as const;
export const PROCESS = ["Απόμακρα / με αντίσταση", "Αμφίθυμα", "Με ασφάλεια, συμμετέχει"] as const;
export const THEMES = [
  "Σχέση με τον εαυτό", "Σχέσεις / σύντροφος", "Οικογένεια", "Παρελθόν", "Ντροπή", "Ενοχή / επανορθώσεις", "Φόβοι",
  "Μνησικακία / θυμός", "Έλεγχος / παράδοση", "Τελειομανία", "Συνεξάρτηση / όρια", "Μοναξιά", "Συναισθηματική νηφαλιότητα",
  "Άλλοι καταναγκασμοί", "Ριψοκίνδυνη κατάσταση", "Πνευματικότητα / νόημα", "Βήμα 1–4",
] as const;
export const JOURNALING = ["Ναι", "Λίγο", "Όχι"] as const;
export const DEFENSES = [
  "Εκλογίκευση", "Άρνηση", "Ελαχιστοποίηση", "Ενοχοποίηση άλλων", "Φυγή σε άλλα θέματα", "Επιστροφή στο παρελθόν", "Χιούμορ ως απόσταση",
] as const;

const text = (max: number) => z.string().trim().max(max).default("");
const pick = <T extends readonly string[]>(opts: T) => z.enum(opts as unknown as [string, ...string[]]);

export const noteFormSchema = z
  .object({
    came: z.boolean().default(true), // «Ήρθε / Δεν ήρθε»· αν δεν ήρθε, το σημείωμα δεν μετράει ως παρουσία
    presented: z.array(pick([...PRESENTED, ...PRESENTED_LEGACY])).default([]),
    presentedText: text(500),
    mood: pick(MOOD).optional(),
    selfHelp: pick([...SELF_HELP, ...SELF_HELP_LEGACY]).optional(),
    process: pick(PROCESS).optional(),
    brought: z.array(z.string().max(120)).max(30).default([]), // θέματα + «Φόρμα Ν · …» της θεματικής
    broughtText: text(6000),
    intervention: text(4000),
    defenses: z.array(pick(DEFENSES)).default([]),
    response: text(1000),
    positives: text(1000),
    journaling: pick(JOURNALING).optional(), // «Γράφει απογραφές;»
    felt: text(2000),
    suggested: text(1000),
    sober: z.boolean(),
    newSoberSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    safeOk: z.boolean(),
    safetyText: text(2000), // «Ανησυχία: Ναι» → τι ανησυχεί και ποιος ενημερώθηκε (ξεχωριστή, υποχρεωτική γραμμή)
    absentText: text(1000), // «Δεν ήρθε» → τι έγινε / τι κάνουμε
    concern: text(3000),
    notify: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!d.safeOk && !d.safetyText) ctx.addIssue({ code: "custom", path: ["safetyText"], message: "Γράψε τι ανησυχεί για την ασφάλεια και ποιος ενημερώθηκε." });
    if (d.came && !d.sober && !d.newSoberSince) ctx.addIssue({ code: "custom", path: ["newSoberSince"], message: "Βάλε τη νέα ημερομηνία νηφαλιότητας." });
    if (d.came && !d.broughtText && !d.intervention && d.brought.length === 0) {
      ctx.addIssue({ code: "custom", path: ["broughtText"], message: "Γράψε τουλάχιστον τι έφερε ή σε τι επικεντρώθηκε η παρέμβαση." });
    }
  });

export type NoteForm = z.infer<typeof noteFormSchema>;

/** Το σημείωμα ως κείμενο, με τη σειρά που το γράφει η ομάδα (για φάκελο, αναζήτηση, παλιές σελίδες). */
export function composeNote(d: NoteForm): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => value && lines.push(`${label}: ${value}`);
  if (!d.came) {
    // «Δεν ήρθε»: μόνο τι έγινε / τι κάνουμε, ασφάλεια και προβληματισμός (όχι κλινικά πεδία).
    lines.push("Δεν ήρθε στην ατομική.");
    add("Τι έγινε / τι κάνουμε", d.absentText);
    lines.push(d.safeOk ? "Ανησυχία για την ασφάλεια: Όχι." : `Ανησυχία για την ασφάλεια: Ναι — ${d.safetyText}`);
    add("Προβληματισμός προς τη θεραπευτική ομάδα", d.concern);
    return lines.join("\n");
  }
  add("Πώς παρουσιάστηκε", [d.presented.join(", "), d.presentedText].filter(Boolean).join(" — "));
  add("Διάθεση", d.mood ?? "");
  add("Πόσο βοηθά τον εαυτό του", d.selfHelp ?? "");
  add("Πώς νιώθει στη διαδικασία", d.process ?? "");
  add("Τι έφερε", [d.brought.join(", "), d.broughtText].filter(Boolean).join(" — "));
  add("Σε τι επικεντρώθηκε η παρέμβαση", d.intervention);
  add("Ανταπόκριση και άμυνες", [d.defenses.join(", "), d.response].filter(Boolean).join(" — "));
  add("Τα θετικά", d.positives);
  add("Γράφει απογραφές", d.journaling ?? "");
  add("Πώς ήταν να είμαι μαζί του σήμερα", d.felt);
  add("Τι προτείναμε", d.suggested);
  lines.push(d.sober ? "Νηφαλιότητα από την προηγούμενη φορά: ναι." : `Νηφαλιότητα από την προηγούμενη φορά: όχι· νέα ημερομηνία νηφαλιότητας ${d.newSoberSince}.`);
  lines.push(d.safeOk ? "Ανησυχία για την ασφάλεια: Όχι." : `Ανησυχία για την ασφάλεια: Ναι — ${d.safetyText || "βλ. προβληματισμό"}`);
  add("Προβληματισμός προς τη θεραπευτική ομάδα", d.concern);
  return lines.join("\n");
}

/** Τα δομημένα πεδία που χρησιμοποιούν η ζώνη ασφάλειας και τα φίλτρα. */
export function noteFlags(d: NoteForm): { riskChange: "UP" | "SAME"; usedSince: "YES" | "NO"; notify: boolean } {
  // Η ενημέρωση της ομάδας γίνεται όταν το ζητήσει ο θεραπευτής, όταν αλλάξει η ασφάλεια ή όταν γράψει προβληματισμό.
  return { riskChange: d.safeOk ? "SAME" : "UP", usedSince: !d.came || d.sober ? "NO" : "YES", notify: d.notify || !d.safeOk || Boolean(d.concern) };
}

type Alertable = { safeOk?: boolean; safetyText?: string; concern?: string; notify?: boolean };
/**
 * Βγαίνει (ξανά) κίτρινη γραμμή 24 ωρών στην ομάδα; Την πρώτη φορά, ό,τι ζητά ενημέρωση.
 * Σε διόρθωση, μόνο αν γράφτηκε κάτι καινούργιο (απόφαση 5/10): η ασφάλεια έγινε «Ναι» ή άλλαξε το τι ανησυχεί,
 * άλλαξε ο προβληματισμός, ή πατήθηκε τώρα «Ενημέρωση ομάδας».
 */
export function alertWorthy(prev: Alertable | null, d: Alertable): boolean {
  const t = (x?: string) => (x ?? "").trim();
  const asks = Boolean(d.notify) || d.safeOk === false || Boolean(t(d.concern));
  if (!prev) return asks;
  return (d.safeOk === false && (prev.safeOk !== false || t(d.safetyText) !== t(prev.safetyText)))
    || (Boolean(t(d.concern)) && t(d.concern) !== t(prev.concern))
    || (Boolean(d.notify) && !prev.notify);
}

/** Ημέρες νηφαλιότητας μέχρι σήμερα (ημερομηνίες ΕΕΕΕ-ΜΜ-ΗΗ, ώρα Ελλάδας). */
export function soberDays(since: string | null | undefined, today: string): number | null {
  if (!since) return null;
  const d = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  const n = Math.round((d(today) - d(since)) / 86_400_000);
  return n >= 0 ? n : null;
}
