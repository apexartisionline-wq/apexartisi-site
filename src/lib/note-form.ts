import { z } from "zod";

// Σημειωματάριο ατομικής, με τη σειρά που γράφει η ομάδα (βλ. CLAUDE.md, «Αποφάσεις»).
// Οι επιλογές είναι γρήγορες· κάθε ενότητα έχει και χώρο για δικά του λόγια.

export const PRESENTED = ["Ήρεμος/η", "Χαρούμενος/η", "Φορτισμένος/η", "Αγχωμένος/η", "Κλειστός/ή", "Θυμωμένος/η", "Λυπημένος/η"] as const;
export const MOOD = ["Χαμηλή", "Μέτρια", "Καλή"] as const;
export const SELF_HELP = ["Δυσκολεύεται", "Κάνει βήματα, με διακυμάνσεις", "Φροντίζει ενεργά τον εαυτό του/της"] as const;
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
    presented: z.array(pick(PRESENTED)).default([]),
    presentedText: text(500),
    mood: pick(MOOD).optional(),
    selfHelp: pick(SELF_HELP).optional(),
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
    concern: text(3000),
    notify: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!d.safeOk && !d.concern) ctx.addIssue({ code: "custom", path: ["concern"], message: "Γράψε τι ανησυχεί και ποιος ενημερώθηκε." });
    if (!d.sober && !d.newSoberSince) ctx.addIssue({ code: "custom", path: ["newSoberSince"], message: "Βάλε τη νέα ημερομηνία νηφαλιότητας." });
    if (d.came && !d.broughtText && !d.intervention && d.brought.length === 0) {
      ctx.addIssue({ code: "custom", path: ["broughtText"], message: "Γράψε τουλάχιστον τι έφερε ή σε τι επικεντρώθηκε η παρέμβαση." });
    }
  });

export type NoteForm = z.infer<typeof noteFormSchema>;

/** Το σημείωμα ως κείμενο, με τη σειρά που το γράφει η ομάδα (για φάκελο, αναζήτηση, παλιές σελίδες). */
export function composeNote(d: NoteForm): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => value && lines.push(`${label}: ${value}`);
  if (!d.came) lines.push("Δεν ήρθε στην ατομική.");
  add("Πώς παρουσιάστηκε", [d.presented.join(", "), d.presentedText].filter(Boolean).join(" — "));
  add("Διάθεση", d.mood ?? "");
  add("Πόσο βοηθά τον εαυτό του/της", d.selfHelp ?? "");
  add("Πώς νιώθει στη διαδικασία", d.process ?? "");
  add("Τι έφερε", [d.brought.join(", "), d.broughtText].filter(Boolean).join(" — "));
  add("Σε τι επικεντρώθηκε η παρέμβαση", d.intervention);
  add("Ανταπόκριση και άμυνες", [d.defenses.join(", "), d.response].filter(Boolean).join(" — "));
  add("Τα θετικά", d.positives);
  add("Γράφει απογραφές", d.journaling ?? "");
  add("Πώς ήταν να είμαι μαζί του/της", d.felt);
  add("Τι προτείναμε", d.suggested);
  lines.push(d.sober ? "Νηφάλιος/α από την προηγούμενη φορά." : `Όχι νηφάλιος/α από την προηγούμενη φορά· νέα ημερομηνία νηφαλιότητας ${d.newSoberSince}.`);
  lines.push(d.safeOk ? "Ανησυχία για την ασφάλεια: Όχι." : "Ανησυχία για την ασφάλεια: Ναι (βλ. προβληματισμό).");
  add("Προβληματισμός προς τη θεραπευτική ομάδα", d.concern);
  return lines.join("\n");
}

/** Τα δομημένα πεδία που χρησιμοποιούν η ζώνη ασφαλείας και τα φίλτρα. */
export function noteFlags(d: NoteForm): { riskChange: "UP" | "SAME"; usedSince: "YES" | "NO"; notify: boolean } {
  // Η ενημέρωση της ομάδας γίνεται όταν το ζητήσει ο θεραπευτής, όταν αλλάξει η ασφάλεια ή όταν γράψει προβληματισμό.
  return { riskChange: d.safeOk ? "SAME" : "UP", usedSince: d.sober ? "NO" : "YES", notify: d.notify || !d.safeOk || Boolean(d.concern) };
}

/** Ημέρες νηφαλιότητας μέχρι σήμερα (ημερομηνίες ΕΕΕΕ-ΜΜ-ΗΗ, ώρα Ελλάδας). */
export function soberDays(since: string | null | undefined, today: string): number | null {
  if (!since) return null;
  const d = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  const n = Math.round((d(today) - d(since)) / 86_400_000);
  return n >= 0 ? n : null;
}
