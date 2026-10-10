import { z } from "zod";

// Ανάγκες ασφάλειας (03) — λιτή μορφή, μέσα στο πλαίσιο υπηρεσιών ψυχολόγου και συμβουλευτικής
// (όχι μονάδα απεξάρτησης· ό,τι ιατρικό → παραπομπή). Αποφάσεις: CLAUDE.md, «Ανάγκες ασφάλειας».

export const REASONS = ["Υποτροπή", "Κόκκινο κουμπί", "Ανησυχία στο σημείωμα", "Σκέψεις στο ημερολόγιο", "Από την αρχική αξιολόγηση", "Άλλο"] as const;

// [κλειδί, ερώτηση, «πες»]: η τρίτη είναι η ίδια ερώτηση σε β΄ πρόσωπο, για να τη διαβάζει ο ψυχολόγος τη στιγμή που ρωτά
// (διατυπώσεις εγκεκριμένες από την υπεύθυνη, 10/10).
export const QUESTIONS = [
  ["notWorth", "Νιώθει ότι δεν αξίζει να ζει, ή ότι θα ήταν καλύτερα να μην ξυπνήσει;", "«Νιώθεις πως δεν αξίζει να ζεις, ή ότι θα ήταν καλύτερα να μην ξυπνήσεις;»"],
  ["thoughtsMethod", "Έχει σκεφτεί να βάλει τέλος στη ζωή του, και πώς;", "«Έχεις σκεφτεί να βάλεις τέλος στη ζωή σου; Έχεις σκεφτεί πώς;»"],
  ["intent", "Έχει πρόθεση ή έχει κάνει προετοιμασίες;", "«Σκοπεύεις να το κάνεις; Έχεις ετοιμάσει κάτι γι' αυτό;»"],
  ["recentHarm", "Αυτοτραυματισμός ή απόπειρα τους τελευταίους 3 μήνες;", "«Τους τελευταίους τρεις μήνες έκανες κακό στον εαυτό σου ή έκανες απόπειρα;»"],
] as const;
export type QuestionKey = (typeof QUESTIONS)[number][0];

export const LEVELS = { LOW: "Συνήθεις", MEDIUM: "Αυξημένες", HIGH: "Υψηλές" } as const;
export type Level = keyof typeof LEVELS;

/** Τι κάνουμε σε κάθε επίπεδο (αποφάσεις της υπεύθυνης). */
export const ACTIONS: Record<Level, string[]> = {
  LOW: ["Συνεχίζουμε κανονικά· το πλάνο ασφάλειας ελέγχεται μαζί."],
  MEDIUM: [
    "Ενημέρωσε το πλάνο ασφάλειας τώρα, μέσα στην ατομική.",
    "Επαφή μέσα σε 24 ώρες από τη διαχείριση.",
    "Ξανά αξιολόγηση στην επόμενη ατομική.",
  ],
  HIGH: [
    "Μείνε με το μέλος στη γραμμή — μην κλείσεις τη σύνδεση.",
    "Άμεσος κίνδυνος: «Έκτακτη ανάγκη» → 112 (ή ΕΚΑΒ 166).",
    "Αλλιώς: παραπομπή σε ψυχίατρο / εφημερεύον νοσοκομείο και 1018.",
    "Ενημέρωσε τη διαχείριση· επαφή την επόμενη μέρα.",
  ],
};

const yes = z.union([z.boolean(), z.literal("DECLINED")]).optional();
const text = (max: number) => z.string().trim().max(max).default("");

export const riskSchema = z
  .object({
    reason: z.enum(REASONS as unknown as [string, ...string[]]).optional(),
    notWorth: yes,
    thoughtsMethod: yes,
    intent: yes,
    recentHarm: yes,
    level: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    rationale: text(2000),
    actions: text(2000),
  })
  .superRefine((d, ctx) => {
    if (!d.level) ctx.addIssue({ code: "custom", path: ["level"], message: "Διάλεξε επίπεδο αναγκών ασφάλειας." });
    if (!d.rationale) ctx.addIssue({ code: "custom", path: ["rationale"], message: "Γράψε σε 2–3 γραμμές τι βλέπεις και τι κάνουμε." });
  });
export type RiskReview = z.infer<typeof riskSchema>;

/** Πρόταση επιπέδου από τις απαντήσεις, όπως στο σχέδιο 03 §4 (ο ψυχολόγος αποφασίζει· αν διστάζει, το υψηλότερο). */
export function suggestedLevel(d: Pick<RiskReview, QuestionKey>): Level | null {
  if (d.intent === true || d.recentHarm === true) return "HIGH";
  if (d.thoughtsMethod === true) return "MEDIUM";
  const others = [d.thoughtsMethod, d.intent, d.recentHarm];
  if (others.every((x) => x === false) && d.notWorth !== undefined && d.notWorth !== "DECLINED") return "LOW";
  return null;
}

export type Trigger = { at: Date; text: string };

/** Θέλει αξιολόγηση; Αν υπάρχει αφορμή (υποτροπή, κόκκινο κουμπί, ανησυχία) μετά την τελευταία αξιολόγηση. */
export function needsReview(triggers: Trigger[], lastReviewAt: Date | null): Trigger | null {
  const after = triggers.filter((t) => !lastReviewAt || t.at > lastReviewAt).sort((a, b) => b.at.getTime() - a.at.getTime());
  return after[0] ?? null;
}

/** Μασκάρει αριθμούς τηλεφώνου σε κείμενο (οι θεραπευτές δεν βλέπουν τηλέφωνα). */
export function maskPhones(s: string): string {
  return s.replace(/\+?\d[\d\s-]{6,}\d/g, "•••");
}
