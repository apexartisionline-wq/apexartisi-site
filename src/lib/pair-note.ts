import { z } from "zod";
import { PRESENTED } from "./note-form";

// Σημειωματάριο Therapair (βλ. CLAUDE.md, «Therapair»): κάθε ερώτηση γράφεται με τα δύο ονόματα,
// αλλά αποθηκεύεται ως ξεχωριστό σημείωμα στον φάκελο του καθενός — χωρίς στοιχεία του άλλου.

export const CONNECTED = ["Ναι", "Λίγο", "Όχι"] as const;
export const ACCEPTED_HELP = ["Ναι", "Λίγο", "Όχι"] as const;
export const STANCE = ["Δεκτικός/ή", "Αμφίθυμος/η", "Άρνηση"] as const;

const text = (max: number) => z.string().trim().max(max).default("");
const pick = <T extends readonly string[]>(opts: T) => z.enum(opts as unknown as [string, ...string[]]);

/** Ό,τι γράφεται για ΕΝΑ μέλος. */
export const pairSideSchema = z
  .object({
    came: z.boolean().default(true),
    presented: z.array(pick(PRESENTED)).default([]),
    presentedText: text(500),
    connected: pick(CONNECTED).optional(),
    acceptedHelp: pick(ACCEPTED_HELP).optional(),
    stance: pick(STANCE).optional(),
    emerged: z.array(z.string().max(120)).max(10).default([]), // «Φόρμα Ν · …» της θεματικής της εβδομάδας
    emergedText: text(4000),
    outcome: text(3000),
    suggested: text(1000),
    sober: z.boolean().default(true),
    newSoberSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    safeOk: z.boolean().default(true),
    concern: text(3000),
    notify: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (!d.safeOk && !d.concern) ctx.addIssue({ code: "custom", path: ["concern"], message: "Γράψε τι ανησυχεί και ποιος ενημερώθηκε." });
    if (!d.sober && !d.newSoberSince) ctx.addIssue({ code: "custom", path: ["newSoberSince"], message: "Βάλε τη νέα ημερομηνία νηφαλιότητας." });
    if (d.came && !d.emergedText && !d.outcome && d.emerged.length === 0) {
      ctx.addIssue({ code: "custom", path: ["emergedText"], message: "Γράψε τουλάχιστον τι εμφανίστηκε ή τι βγήκε από την κουβέντα." });
    }
  });
export type PairSide = z.infer<typeof pairSideSchema>;

export const pairNoteSchema = z.object({ a: pairSideSchema, b: pairSideSchema });

/**
 * Κρύβει το όνομα του άλλου μέλους από ελεύθερο κείμενο («το άλλο μέλος»), ώστε να μη μπει
 * ποτέ στον φάκελο του ενός στοιχείο του άλλου. Πιάνει ολόκληρο όνομα, μικρό όνομα και κλητική.
 */
export function hideOther(textIn: string, otherNames: string[]): string {
  const names = [...new Set(otherNames.map((n) => n.trim()).filter((n) => n.length >= 3))].sort((x, y) => y.length - x.length);
  let out = textIn;
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const word = `${esc}(?![\\p{L}])`;
    // Μαζί με το άρθρο, ώστε να διαβάζεται σωστά («τον Νίκο» → «το άλλο μέλος», «του Νίκου» → «του άλλου μέλους»).
    out = out
      .replace(new RegExp(`(?<![\\p{L}])(στον|στην|στη)\\s+${word}`, "giu"), "στο άλλο μέλος")
      .replace(new RegExp(`(?<![\\p{L}])(του|της)\\s+${word}`, "giu"), "του άλλου μέλους")
      .replace(new RegExp(`(?<![\\p{L}])(ο|η|τον|την|τη)\\s+${word}`, "giu"), "το άλλο μέλος")
      .replace(new RegExp(`(?<![\\p{L}])${word}`, "giu"), "το άλλο μέλος");
  }
  return out;
}

/** Παραλλαγές του ονόματος του άλλου (ολόκληρο, μικρό, κλητική, χωρίς τόνους δεν χρειάζεται: γράφεται όπως στο σύστημα). */
export function nameVariants(fullName: string, vocative: (s: string) => string): string[] {
  const first = fullName.split(" ")[0] ?? "";
  return [fullName, first, vocative(first)];
}

/** Το σημείωμα ενός μέλους ως κείμενο — μόνο για εκείνον· ο άλλος είναι «το άλλο μέλος». */
export function composePairNote(d: PairSide, otherNames: string[]): string {
  const h = (s: string) => hideOther(s, otherNames);
  const lines: string[] = ["Therapair (με άλλο μέλος της ομάδας)."];
  const add = (label: string, value: string) => value && lines.push(`${label}: ${value}`);
  if (!d.came) lines.push("Δεν ήρθε στο Therapair.");
  add("Πώς παρουσιάστηκε", [d.presented.join(", "), h(d.presentedText)].filter(Boolean).join(" — "));
  add("Συνδέθηκε με το άλλο μέλος", d.connected ?? "");
  add("Δέχτηκε βοήθεια", d.acceptedHelp ?? "");
  add("Στάση", d.stance ?? "");
  add("Τι εμφανίστηκε", [d.emerged.join(", "), h(d.emergedText)].filter(Boolean).join(" — "));
  add("Τι βγήκε από την κουβέντα", h(d.outcome));
  add("Τι προτείναμε", h(d.suggested));
  lines.push(d.sober ? "Νηφάλιος/α από την προηγούμενη φορά." : `Όχι νηφάλιος/α από την προηγούμενη φορά· νέα ημερομηνία νηφαλιότητας ${d.newSoberSince}.`);
  lines.push(d.safeOk ? "Ασφάλεια: χωρίς ανησυχία." : "Ασφάλεια: υπάρχει ανησυχία (βλ. προβληματισμό).");
  add("Προβληματισμός προς τη θεραπευτική ομάδα", h(d.concern));
  return lines.join("\n");
}

/** Τα ελεύθερα κείμενα χωρίς το όνομα του άλλου (για την αποθήκευση των δομημένων πεδίων). */
export function scrubSide(d: PairSide, otherNames: string[]): PairSide {
  const h = (s: string) => hideOther(s, otherNames);
  return { ...d, presentedText: h(d.presentedText), emergedText: h(d.emergedText), outcome: h(d.outcome), suggested: h(d.suggested), concern: h(d.concern) };
}

export function pairFlags(d: PairSide): { riskChange: "UP" | "SAME"; usedSince: "YES" | "NO"; notify: boolean } {
  return { riskChange: d.safeOk ? "SAME" : "UP", usedSince: d.sober ? "NO" : "YES", notify: d.notify || !d.safeOk || Boolean(d.concern) };
}
