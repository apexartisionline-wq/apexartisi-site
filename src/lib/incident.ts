import { z } from "zod";

// Συμβάν (08) — μόνο για σοβαρά. Λίγα πεδία· την κλείνει η Εύα.
export const INCIDENT_KINDS = [
  "Κλήση 112 / ΕΚΑΒ",
  "Κίνδυνος για τη ζωή",
  "Παιδί σε κίνδυνο / βία στο σπίτι",
  "Μέλος σε κίνδυνο που δεν βρέθηκε",
  "Παραβίαση εμπιστευτικότητας",
  "Άλλο σοβαρό",
] as const;

const t = (max: number) => z.string().trim().max(max);
export const incidentSchema = z.object({
  kind: z.enum(INCIDENT_KINDS as unknown as [string, ...string[]]),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Βάλε ημερομηνία και ώρα."),
  what: t(3000).min(1, "Γράψε τι έγινε."),
  actions: t(2000).min(1, "Γράψε τι κάναμε."),
  informed: t(500).default(""),
  outcome: t(1000).default(""),
});
export type IncidentData = z.infer<typeof incidentSchema>;

// Ολοκλήρωση συνεργασίας (09)
export const CLOSURE_HOW = { COMPLETED: "Ολοκλήρωση", STOPPED: "Διακοπή από το μέλος", LOST: "Απώλεια επαφής" } as const;

export function doorOpenMessage(firstName: string, months: number): string {
  return [
    `${firstName}, σε ευχαριστούμε για τον δρόμο που περπατήσαμε μαζί${months === 1 ? " αυτόν τον πρώτο μήνα" : months > 1 ? ` αυτούς τους ${months} μήνες` : ""}.`,
    "Κάθε φορά που ήρθες, που έγραψες, που κοίταξες μέσα σου, ήταν μια επιλογή για τον εαυτό σου — και αυτή η δουλειά μένει δική σου.",
    "Η πόρτα μας είναι πάντα ανοιχτή. Όποτε θελήσεις να συνεχίσουμε, είμαστε εδώ.",
    "Με εκτίμηση,\nη ομάδα του Apex",
  ].join("\n\n");
}
