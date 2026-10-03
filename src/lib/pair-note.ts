import { z } from "zod";
import { JOURNALING, PRESENTED } from "./note-form";

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
    positives: text(1000),
    journaling: pick(JOURNALING).optional(),
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

// Σύγκριση χωρίς τόνους και κεφαλαία («Γιωργος», «ΕΛΕΝΗ» = «Γιώργος», «Ελένη»).
const norm = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
// Το θέμα του ονόματος, χωρίς κατάληξη, για να πιάνονται και οι πτώσεις («Γιώργου», «Ελένης», «Γιώργη»).
const stemOf = (w: string) => norm(w).replace(/(ουσ|οσ|ου|ησ|ασ|εσ|ισ|ων|οι|ο|ε|η|α|ι)$/, "");

type Matcher = { stems: string[]; initials: string[]; exact: Set<string> };
// Χαϊδευτικά/προτιμώμενο όνομα (π.χ. «Λένα»): μόνο οι ακριβείς μορφές του, όχι ρίζα — για να μην πιάνει
// κοινές λέξεις («λένε»). Γράφονται με «~» μπροστά στη λίστα ονομάτων.
function exactForms(nick: string): string[] {
  const n = norm(nick);
  const st = n.replace(/(οσ|ησ|ασ|α|η|ο)$/, "");
  return [n, `${n}σ`, `${st}ου`, `${st}ο`, `${st}η`, `${st}α`].filter((x) => x.length >= 3);
}
function matcher(names: string[]): Matcher {
  const otherNames = names.filter((n) => !n.startsWith("~"));
  const exact = new Set(names.filter((n) => n.startsWith("~")).flatMap((n) => n.slice(1).trim().split(/\s+/)).filter((w) => w.length >= 3).flatMap(exactForms));
  const words = [...new Set(otherNames.flatMap((n) => n.trim().split(/\s+/)).filter(Boolean))];
  const first = otherNames[0]?.trim().split(/\s+/)[0] ?? "";
  const surnames = new Set(otherNames[0]?.trim().split(/\s+/).slice(1) ?? []);
  // Μικρό όνομα από 3 γράμματα θέμα· επώνυμο μόνο αν είναι μακρύ (για να μην πιάνει κοινές λέξεις).
  const stems = [...new Set(words.map((w) => ({ w, st: stemOf(w) })).filter(({ w, st }) => st.length >= (surnames.has(w) ? 5 : 3)).map(({ st }) => st))];
  return { stems, initials: first ? [norm(first)[0]] : [], exact };
}
const isOther = (word: string, m: Matcher) => {
  const n = norm(word);
  return m.exact.has(n) || m.stems.some((st) => n.startsWith(st) && n.length - st.length <= 4);
};

/** Ποιες λέξεις του κειμένου μοιάζουν με το όνομα του άλλου μέλους (για προειδοποίηση πριν την αποθήκευση). */
export function findOther(textIn: string, otherNames: string[]): string[] {
  const m = matcher(otherNames);
  const found = (textIn.match(/\p{L}+/gu) ?? []).filter((w) => isOther(w, m));
  const initials = textIn.match(/(?<!\p{L})(?:ο|η|τον|την|τη|του|της)\s+\p{Lu}\./gu) ?? [];
  return [...new Set([...found, ...initials.filter((x) => m.initials.includes(norm(x.slice(-2, -1))))])];
}

/**
 * Κρύβει το όνομα του άλλου μέλους από ελεύθερο κείμενο («το άλλο μέλος»), ώστε να μη μπει
 * ποτέ στον φάκελο του ενός στοιχείο του άλλου. Πιάνει ολόκληρο όνομα, μικρό όνομα, πτώσεις,
 * χαϊδευτικά με την ίδια ρίζα, χωρίς τόνους ή με κεφαλαία, και αρχικό με άρθρο («ο Γ.»).
 */
export function hideOther(textIn: string, otherNames: string[]): string {
  const m = matcher(otherNames);
  const phrase = (art: string | undefined) => {
    const a = (art ?? "").toLowerCase();
    if (a.startsWith("στ")) return "στο άλλο μέλος";
    if (a === "του" || a === "της") return "του άλλου μέλους";
    return "το άλλο μέλος";
  };
  let out = textIn.replace(/(?<!\p{L})(?:(στον|στην|στη|του|της|ο|η|τον|την|τη)\s+)?(\p{L}+)(?!\p{L})/giu, (all, art: string | undefined, word: string) =>
    isOther(word, m) ? phrase(art) : all,
  );
  out = out.replace(/(?<!\p{L})(στον|στην|στη|του|της|ο|η|τον|την|τη)\s+(\p{Lu})\.(?!\p{L})/gu, (all, art: string, ini: string) =>
    m.initials.includes(norm(ini)) ? phrase(art) : all,
  );
  // «το άλλο μέλος το άλλο μέλος» (όνομα + επώνυμο) → μία φορά· κεφαλαίο στην αρχή πρότασης.
  out = out.replace(/(το άλλο μέλος|του άλλου μέλους|στο άλλο μέλος)(\s+(?:το άλλο μέλος|του άλλου μέλους))+/g, "$1");
  out = out.replace(/(^|[.!;]\s+)(το|του|στο) (άλλο|άλλου)/g, (_a, pre: string, w: string, x: string) => `${pre}${w[0].toUpperCase()}${w.slice(1)} ${x}`);
  return out;
}

/** Παραλλαγές του ονόματος του άλλου (ολόκληρο, μικρό, κλητική, χωρίς τόνους δεν χρειάζεται: γράφεται όπως στο σύστημα). */
export function nameVariants(fullName: string, vocative: (s: string) => string, nickname?: string): string[] {
  const first = fullName.split(" ")[0] ?? "";
  return [fullName, first, vocative(first), ...(nickname?.trim() ? [`~${nickname.trim()}`] : [])];
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
  add("Τα θετικά", h(d.positives));
  add("Γράφει απογραφές", d.journaling ?? "");
  add("Τι προτείναμε", h(d.suggested));
  lines.push(d.sober ? "Νηφάλιος/α από την προηγούμενη φορά." : `Όχι νηφάλιος/α από την προηγούμενη φορά· νέα ημερομηνία νηφαλιότητας ${d.newSoberSince}.`);
  lines.push(d.safeOk ? "Ανησυχία για την ασφάλεια: Όχι." : "Ανησυχία για την ασφάλεια: Ναι (βλ. προβληματισμό).");
  add("Προβληματισμός προς τη θεραπευτική ομάδα", h(d.concern));
  return lines.join("\n");
}

/** Τα ελεύθερα κείμενα χωρίς το όνομα του άλλου (για την αποθήκευση των δομημένων πεδίων). */
export function scrubSide(d: PairSide, otherNames: string[]): PairSide {
  const h = (s: string) => hideOther(s, otherNames);
  return { ...d, presentedText: h(d.presentedText), emergedText: h(d.emergedText), outcome: h(d.outcome), positives: h(d.positives), suggested: h(d.suggested), concern: h(d.concern) };
}

export function pairFlags(d: PairSide): { riskChange: "UP" | "SAME"; usedSince: "YES" | "NO"; notify: boolean } {
  return { riskChange: d.safeOk ? "SAME" : "UP", usedSince: d.sober ? "NO" : "YES", notify: d.notify || !d.safeOk || Boolean(d.concern) };
}
