import { z } from "zod";

// Αρχική αξιολόγηση (02) — μόνο τα πεδία της εγκεκριμένης λίστας: docs/clinical/02-telikh-lista.md.
// Καθαρές συναρτήσεις (χωρίς βάση), για να ελέγχονται με tests.

export const SUBSTANCES = [
  ["alcohol", "Αλκοόλ"],
  ["opioids", "Οπιοειδή"],
  ["cocaine", "Κοκαΐνη"],
  ["cannabis", "Κάνναβη"],
  ["pills", "Χάπια"],
  ["amphetamines", "Αμφεταμίνες"],
  ["synthetic", "Συνθετικά"],
  ["gambling", "Τζόγος"],
  ["other", "Άλλο"],
] as const;
export type SubstanceKey = (typeof SUBSTANCES)[number][0];
const SUBSTANCE_KEYS = SUBSTANCES.map((s) => s[0]) as [SubstanceKey, ...SubstanceKey[]];
export const SUBSTANCE_LABEL = Object.fromEntries(SUBSTANCES) as Record<SubstanceKey, string>;

export const DIAGNOSES = ["Κατάθλιψη", "Διπολική", "ΔΕΠΥ", "Αγχώδης", "Ψύχωση", "Διατροφική", "Διαταραχή προσωπικότητας"] as const;
export const TREATMENT_WHERE = ["Μονάδα / πρόγραμμα", "ΑΑ / ΝΑ / GA", "Ιδιώτης", "Άλλο"] as const;
export const TREATMENT_END = ["Ολοκληρώθηκε", "Διακόπηκε", "Αποβολή", "Συνεχίζεται"] as const;
// Παλιές λέξεις που αποθηκεύτηκαν πριν αλλάξει η διατύπωση: διαβάζονται πάντα.
const OLD_END: Record<string, string> = { Ολοκλήρωση: "Ολοκληρώθηκε", Διακοπή: "Διακόπηκε" };
export const AS_PRESCRIBED = ["Ναι", "Όχι πάντα", "Όχι"] as const;
export const TRAUMA = ["Ναι", "Όχι", "Δεν θέλω να πω"] as const;
export const ABSTINENCE = ["Δέσμευση στην αποχή", "Όχι ακόμα"] as const;
const ABSTINENCE_LEGACY = ["Δεσμευμένος/η στην αποχή"] as const;

// ⚠ ΔΟΚΙΜΗ: προσωρινά κείμενα. Σε πραγματικά μέλη μόνο με γραπτή άδεια και επίσημη ελληνική έκδοση
// (docs/clinical/erotimatologia-adeies.md). Το AUDIT είναι η απόδοση του σχεδίου 02.
// Για νηφάλια μέλη ρωτάμε για την ΠΕΡΙΟΔΟ ΒΑΡΙΑΣ ΧΡΗΣΗΣ (απόφαση υπεύθυνης): ο αριθμός δεν λέει «κίνδυνο τώρα».
export const AUDIT_ITEMS: { q: string; options: [number, string][] }[] = (() => {
  const freq = ["ποτέ", "λιγότερο από μηνιαία", "μηνιαία", "εβδομαδιαία", "καθημερινά ή σχεδόν"];
  const f = (q: string) => ({ q, options: freq.map((o, i) => [i, o] as [number, string]) });
  const yn = (q: string) => ({ q, options: [[0, "όχι"], [2, "ναι, όχι τον τελευταίο χρόνο"], [4, "ναι, τον τελευταίο χρόνο"]] as [number, string][] });
  return [
    { q: "Πόσο συχνά έπινε κάποιο αλκοολούχο ποτό;", options: [[0, "ποτέ"], [1, "1 φορά τον μήνα ή λιγότερο"], [2, "2–4 φορές τον μήνα"], [3, "2–3 φορές την εβδομάδα"], [4, "4+ φορές την εβδομάδα"]] },
    { q: "Πόσες μονάδες αλκοόλ μια τυπική μέρα που έπινε;", options: [[0, "1–2"], [1, "3–4"], [2, "5–6"], [3, "7–9"], [4, "10+"]] },
    f("Πόσο συχνά έπινε 6 ή περισσότερες μονάδες σε μία περίσταση;"),
    f("Πόσο συχνά δεν μπορούσε να σταματήσει αφού άρχισε;"),
    f("Πόσο συχνά δεν έκανε αυτό που περίμεναν εξαιτίας του ποτού;"),
    f("Πόσο συχνά χρειάστηκε ποτό το πρωί για να «στρώσει»;"),
    f("Πόσο συχνά ένιωσε ενοχές ή τύψεις μετά το ποτό;"),
    f("Πόσο συχνά δεν θυμόταν τι έγινε το προηγούμενο βράδυ;"),
    yn("Έχει τραυματιστεί ο ίδιος ή κάποιος άλλος εξαιτίας του ποτού;"),
    yn("Έχει ανησυχήσει κάποιος για το ποτό του ή του πρότεινε να το κόψει;"),
  ];
})();
export const DAST_ITEMS = Array.from({ length: 10 }, (_, i) => `DAST-10 · ερώτηση ${i + 1} (το επίσημο κείμενο μπαίνει μετά την άδεια)`);
export const PGSI_ITEMS = Array.from({ length: 9 }, (_, i) => `PGSI · ερώτηση ${i + 1} (το επίσημο κείμενο μπαίνει μετά την άδεια)`);
export const PGSI_OPTIONS: [number, string][] = [[0, "ποτέ"], [1, "μερικές φορές"], [2, "τις περισσότερες φορές"], [3, "σχεδόν πάντα"]];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max).default("");
const pick = <T extends readonly string[]>(opts: T) => z.enum(opts as unknown as [string, ...string[]]);
// true / false / "DECLINED" (= «δεν θέλει να απαντήσει ακόμα»)· undefined = δεν ρωτήθηκε ακόμα.
const yes = z.union([z.boolean(), z.literal("DECLINED")]).optional();
export type YesNo = boolean | "DECLINED" | undefined;

export const assessmentSchema = z.object({
  profileConfirmed: z.boolean().default(false),
  // 5. Ιστορικό χρήσης
  substances: z.array(z.enum(SUBSTANCE_KEYS)).default([]),
  otherName: text(100),
  perSubstance: z.partialRecord(z.enum(SUBSTANCE_KEYS), z.object({ problemAge: z.number().int().min(5).max(99).optional(), lastUse: date.optional() })).default({}),
  overdoseEver: yes,
  overdoseLast: date.optional(),
  seizuresEver: yes,
  ost: yes,
  debtThreats: yes,
  audit: z.array(z.number().int().min(0).max(4).nullable()).max(10).default([]),
  dast: z.array(z.boolean().nullable()).max(10).default([]),
  pgsi: z.array(z.number().int().min(0).max(3).nullable()).max(9).default([]),
  // 6. Προηγούμενες θεραπείες
  treatments: z.array(z.object({ where: pick(TREATMENT_WHERE), whereText: text(200), when: text(60), duration: text(60), ended: z.preprocess((v) => OLD_END[v as string] ?? v, pick(TREATMENT_END).optional()), helped: text(1000) })).max(20).default([]),
  longestAbstinence: text(100),
  longestHelped: text(1000),
  longestEnded: text(1000),
  // 7. Ψυχιατρικό
  diagnoses: z.array(pick(DIAGNOSES)).default([]),
  diagnosesText: text(500),
  hospitalisedEver: yes,
  attemptEver: yes,
  psychoticNow: yes,
  trauma: pick(TRAUMA).optional(),
  meds: z.array(z.object({ name: text(100), dose: text(60), why: text(200), asPrescribed: pick(AS_PRESCRIBED).optional() })).max(20).default([]),
  psychiatristName: text(120),
  psychiatristPhone: text(40), // μόνο διαχείριση
  // 8. Υγεία
  pregnant: yes,
  healthNote: text(1000),
  // 9. Νομικά (λεπτομέρειες: μόνο διαχείριση)
  courtObligation: yes,
  prisonRecent: yes,
  legalDetail: text(1000), // μόνο διαχείριση
  // 10. Οικογένεια
  children: yes,
  childConcern: yes,
  childConcernText: text(1000),
  violence: yes,
  violenceText: text(1000),
  // 11. Κίνητρο
  whyNow: text(2000),
  abstinence: pick([...ABSTINENCE, ...ABSTINENCE_LEGACY]).optional(),
  workOn: text(2000),
  strengths: text(2000),
  fears: text(2000),
  // Σύνοψη για την ομάδα
  summary: text(4000),
});
export type Assessment = z.infer<typeof assessmentSchema>;

/** Πεδία που μετά την ολοκλήρωση τα βλέπει μόνο η διαχείριση. */
export const ADMIN_ONLY = ["psychiatristPhone", "legalDetail"] as const;

export function stripAdminOnly(d: Assessment): Assessment {
  return { ...d, psychiatristPhone: "", legalDetail: "" };
}

/** Κρατά τα πεδία της διαχείρισης από την προηγούμενη μορφή όταν αποθηκεύει κάποιος που δεν τα βλέπει. */
export function keepAdminOnly(next: Assessment, prev: Assessment | null): Assessment {
  if (!prev) return next;
  return { ...next, psychiatristPhone: prev.psychiatristPhone, legalDetail: prev.legalDetail };
}

// ── Βαθμολογίες ────────────────────────────────────────────────────────────

export type Score = { score: number; answered: number; of: number; band: string; level: "ok" | "amber" | "red" | "plain" };

/** AUDIT, DAST-10 και PGSI αφορούν την περίοδο βαριάς χρήσης: φαίνεται ο αριθμός, χωρίς χαρακτηρισμό κινδύνου «τώρα». */
export const HEAVY_USE = "περίοδος βαριάς χρήσης";

export function auditScore(a: (number | null)[]): Score | null {
  const xs = a.filter((x): x is number => x !== null && x !== undefined);
  if (xs.length === 0) return null;
  const score = xs.reduce((s, x) => s + x, 0);
  return { score, answered: xs.length, of: 10, band: HEAVY_USE, level: "plain" };
}

/** DAST-10: «ναι» = 1, εκτός από την ερώτηση 3 όπου «όχι» = 1. */
export function dastScore(a: (boolean | null)[]): Score | null {
  let answered = 0;
  let score = 0;
  a.forEach((x, i) => {
    if (x === null || x === undefined) return;
    answered++;
    if (i === 2 ? !x : x) score++;
  });
  if (answered === 0) return null;
  return { score, answered, of: 10, band: HEAVY_USE, level: "plain" };
}

export function pgsiScore(a: (number | null)[]): Score | null {
  const xs = a.filter((x): x is number => x !== null && x !== undefined);
  if (xs.length === 0) return null;
  const score = xs.reduce((s, x) => s + x, 0);
  return { score, answered: xs.length, of: 9, band: HEAVY_USE, level: "plain" };
}

/** Ποια ερωτηματολόγια ανοίγουν: AUDIT για όλους, DAST-10 αν υπάρχει ουσία εκτός αλκοόλ, PGSI αν υπάρχει τζόγος. */
export function questionnaires(d: Pick<Assessment, "substances">) {
  return {
    audit: true,
    dast: d.substances.some((s) => s !== "alcohol" && s !== "gambling"),
    pgsi: d.substances.includes("gambling"),
  };
}

// ── Αυτοματισμοί ───────────────────────────────────────────────────────────

/** Νηφαλιότητα: η πιο πρόσφατη «τελευταία φορά» από όσα τσεκαρίστηκαν. */
export function soberSinceFrom(d: Pick<Assessment, "substances" | "perSubstance">): string | null {
  const dates = d.substances.map((s) => d.perSubstance[s]?.lastUse).filter((x): x is string => Boolean(x));
  return dates.length ? dates.sort().at(-1)! : null;
}

export const ALERTS = {
  CHILD: "Ανησυχία για την ασφάλεια παιδιού",
  VIOLENCE: "Βία στο σπίτι",
  OVERDOSE: "Υπερδοσολογία τους τελευταίους 3 μήνες",
  PSYCHOSIS: "Ψυχωσικά συμπτώματα τώρα",
  PREGNANCY: "Εγκυμοσύνη",
} as const;
export type AlertKind = keyof typeof ALERTS;

/** Σοβαρά σημεία (απλοί, ορατοί κανόνες): φαίνονται στο «Ασφάλεια» του φακέλου και 24 ώρες στο «Σήμερα». */
export function assessmentAlerts(d: Assessment, today: string): AlertKind[] {
  const out: AlertKind[] = [];
  if (d.children === true && d.childConcern === true) out.push("CHILD");
  if (d.violence === true) out.push("VIOLENCE");
  if (d.overdoseEver === true && d.overdoseLast && daysBetween(d.overdoseLast, today) <= 90) out.push("OVERDOSE");
  if (d.psychoticNow === true) out.push("PSYCHOSIS");
  if (d.pregnant === true) out.push("PREGNANCY");
  return out;
}

/** Προειδοποιήσεις για ασυνέπειες (δεν εμποδίζουν την αποθήκευση). */
export function assessmentWarnings(d: Assessment): string[] {
  const out: string[] = [];
  const since = soberSinceFrom(d);
  if (since && d.overdoseEver === true && d.overdoseLast && d.overdoseLast > since) {
    out.push(`Η υπερδοσολογία (${gr(d.overdoseLast)}) είναι μετά την «τελευταία φορά» (${gr(since)}). Έλεγξε τις ημερομηνίες.`);
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

// ── Προβολή ────────────────────────────────────────────────────────────────

export const gr = (iso: string) => { const [y, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}/${y}`; };

/** Η αξιολόγηση ως ενότητες, με τη σειρά που γίνεται, για τον φάκελο. Τα «Όχι» μαζεύονται σε μία γραμμή. */
export function assessmentLines(d: Assessment, opts: { admin: boolean }): { title: string; lines: [string, string][] }[] {
  // Ναι/Όχι: τα «Ναι» και τα «δεν απάντησε» φαίνονται ως γραμμές· τα «Όχι» σε μία γραμμή στο τέλος της ενότητας.
  type Row = [string, string | undefined] | { q: string; v: YesNo; extra?: string };
  const sec = (title: string, rows: Row[]) => {
    const lines: [string, string][] = [];
    const no: string[] = [];
    for (const r of rows) {
      if (Array.isArray(r)) { if (r[1]) lines.push([r[0], r[1]]); continue; }
      if (r.v === true) lines.push([r.q, ["Ναι", r.extra].filter(Boolean).join(" — ")]);
      else if (r.v === "DECLINED") lines.push([r.q, "δεν απάντησε ακόμα"]);
      else if (r.v === false) no.push(r.q);
    }
    if (no.length) lines.push(["Όχι", no.join(" · ")]);
    return { title, lines };
  };
  const q = questionnaires(d);
  return [
    sec("Γιατί τώρα", [
      ["Γιατί τώρα", d.whyNow],
      ["Αποχή", d.abstinence],
      ["Τι θέλει να δουλέψει στον εαυτό του", d.workOn],
      ["Μεγαλύτερη αποχή", [d.longestAbstinence, d.longestHelped && `τη βοήθησε: ${d.longestHelped}`, d.longestEnded && `την έληξε: ${d.longestEnded}`].filter(Boolean).join(" · ")],
    ]),
    sec("Ιστορικό χρήσης", [
      ...d.substances.map((s): Row => {
        const p = d.perSubstance[s] ?? {};
        const name = s === "other" && d.otherName ? d.otherName : SUBSTANCE_LABEL[s];
        return [name, [p.problemAge ? `έγινε πρόβλημα στα ${p.problemAge}` : "", p.lastUse ? `τελευταία φορά ${gr(p.lastUse)}` : ""].filter(Boolean).join(" · ") || "χωρίς ημερομηνίες"];
      }),
      ["AUDIT", fmt(auditScore(d.audit))],
      ["DAST-10", q.dast ? fmt(dastScore(d.dast)) : undefined],
      ["PGSI", q.pgsi ? fmt(pgsiScore(d.pgsi)) : undefined],
      { q: "Υπερδοσολογία, έστω μία φορά", v: d.overdoseEver, extra: d.overdoseLast && `τελευταία ${gr(d.overdoseLast)}` },
      { q: "Στερητικά με σπασμούς, έστω μία φορά", v: d.seizuresEver },
      { q: "Μεθαδόνη / βουπρενορφίνη", v: d.ost },
      ...(q.pgsi ? [{ q: "Χρέη με απειλές", v: d.debtThreats } as Row] : []),
    ]),
    sec("Προηγούμενες θεραπείες", d.treatments.map((t, i): Row => [`${i + 1}. ${t.where}${t.whereText ? ` · ${t.whereText}` : ""}`, [t.when, t.duration, t.ended, t.helped && `βοήθησε: ${t.helped}`].filter(Boolean).join(" · ") || "—"])),
    sec("Ψυχιατρικό", [
      ["Διαγνώσεις που του έχουν πει", [d.diagnoses.join(", "), d.diagnosesText].filter(Boolean).join(" — ")],
      { q: "Ψυχωσικά τώρα", v: d.psychoticNow },
      { q: "Απόπειρα / αυτοτραυματισμός, έστω μία φορά", v: d.attemptEver },
      { q: "Νοσηλεία σε ψυχιατρική κλινική, έστω μία φορά", v: d.hospitalisedEver },
      ["Τραύμα", d.trauma],
      ...d.meds.filter((m) => m.name).map((m): Row => [`Φάρμακο: ${m.name}`, [m.dose, m.why, m.asPrescribed && `το παίρνει όπως γράφεται: ${m.asPrescribed.toLowerCase()}`].filter(Boolean).join(" · ") || "—"]),
      ["Ψυχίατρος", d.psychiatristName],
      ["Τηλέφωνο ψυχιάτρου", opts.admin ? d.psychiatristPhone : undefined],
    ]),
    sec("Υγεία", [
      { q: "Εγκυμοσύνη", v: d.pregnant },
      ["Να ξέρουμε", d.healthNote],
    ]),
    sec("Νομικά", [
      { q: "Υποχρέωση θεραπείας / βεβαίωσης από δικαστήριο", v: d.courtObligation },
      { q: "Βγήκε από φυλακή τους τελευταίους 3 μήνες", v: d.prisonRecent },
      ["Λεπτομέρειες (διαχείριση)", opts.admin ? d.legalDetail : undefined],
    ]),
    sec("Οικογένεια", [
      { q: "Παιδιά κάτω των 18", v: d.children },
      ...(d.children === true ? [{ q: "Ανησυχία για την ασφάλεια παιδιού", v: d.childConcern, extra: d.childConcernText } as Row] : []),
      { q: "Βία στο σπίτι", v: d.violence, extra: d.violenceText },
    ]),
    sec("Δυνάμεις και φόβοι", [
      ["Δυνάμεις", d.strengths],
      ["Τι φοβάται από τη συνεργασία", d.fears],
    ]),
  ].filter((s) => s.lines.length > 0);
}

export function fmt(s: Score | null): string | undefined {
  if (!s) return undefined;
  return `${s.score} · ${s.band}${s.answered < s.of ? ` (απαντήθηκαν ${s.answered} από ${s.of})` : ""}`;
}

/** Τι λείπει για να ολοκληρωθεί (μόνο τα απαραίτητα — δεν «κλειδώνει» τίποτα άλλο). */
export function missingForComplete(d: Assessment): string[] {
  const out: string[] = [];
  if (!d.profileConfirmed) out.push("Επιβεβαίωση των στοιχείων του μέλους");
  if (d.substances.length === 0) out.push("Ιστορικό χρήσης: ποιες ουσίες / τζόγος");
  if (d.overdoseEver === true && !d.overdoseLast) out.push("Ιστορικό χρήσης: πότε ήταν η τελευταία υπερδοσολογία (έστω περίπου)");
  if (d.children === undefined || d.violence === undefined) out.push("Οικογένεια: παιδιά και βία στο σπίτι");
  if (d.children === true && d.childConcern === undefined) out.push("Οικογένεια: ανησυχία για την ασφάλεια του παιδιού");
  if (d.psychoticNow === undefined) out.push("Ψυχιατρικό: ψυχωσικά τώρα");
  if (!d.summary) out.push("Σύνοψη για την ομάδα");
  return out;
}
