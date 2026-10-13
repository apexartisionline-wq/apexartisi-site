// «Το πλάνο μου όταν δυσκολεύομαι» (Α): προσωπικό, πρακτικό πλάνο υποστήριξης και πρόληψης υποτροπής,
// γραμμένο μαζί, μέσα στην ατομική, με τα λόγια του μέλους (docs/clinical/04). Ξεχωριστό από το
// την αξιολόγηση «Ανάγκες ασφάλειας» (Β) και το πρωτόκολλο ανά επίπεδο (src/lib/risk.ts). Κανένα από αυτά δεν είναι
// εξατομικευμένο κλινικό πλάνο: αυτό θα σχεδιαστεί με τον αρμόδιο ψυχολόγο (διευκρινίσεις υπεύθυνης 13/10).
//
// Καθαρή λογική, χωρίς βάση: τη διαβάζουν και τα components και τα tests. Η αποθήκευση είναι στο safety.ts.
//
// Οι 7 ερωτήσεις της διεπαφής (οδηγία υπεύθυνης, ενότητα 11) αντιστοιχούν 1:1 στα παλιά πεδία — καμία
// μετανάστευση δεδομένων, μόνο ετικέτες και διάταξη. Οι διατυπώσεις χρειάζονται έγκριση της θεραπευτικής ομάδας.
export const PLAN_FIELDS = [
  // παλιά ονομασία: «Σημάδια ότι δυσκολεύομαι»
  { key: "warningSigns", label: "Πώς καταλαβαίνω ότι δυσκολεύομαι;", hint: "σκέψεις, συναισθήματα, μέρη, άνθρωποι, λαχτάρα" },
  // παλιά ονομασία: «Τι κάνω για τον εαυτό μου»
  { key: "myCoping", label: "Τι με βοηθά εκείνη τη στιγμή;", hint: "π.χ. περπάτημα, ντους, αναπνοή, μουσική" },
  // παλιά ονομασία: «Άνθρωποι και μέρη που με βοηθούν να ξεφύγω»
  { key: "distractions", label: "Πού μπορώ να πάω ή με ποιον να είμαι;", hint: "" },
  // παλιά ονομασία: «Πώς κάνω το περιβάλλον μου πιο ασφαλές»
  { key: "safeEnvironment", label: "Τι χρειάζεται να αλλάξω γύρω μου για να προστατευτώ;", hint: "ουσίες, χρήματα/κάρτες για τζόγο, άλλα μέσα" },
  // παλιά ονομασία: «Γιατί αξίζει να συνεχίσω»
  { key: "reasons", label: "Τι έχει σημασία για μένα και θέλω να προστατεύσω;", hint: "" },
] as const;
export type PlanFieldKey = (typeof PLAN_FIELDS)[number]["key"];

/** Η λίστα των ανθρώπων: «Ποιον μπορώ να καλέσω;» — η σειρά είναι η απάντηση στο «Αν δεν απαντήσει, ποιο είναι το επόμενο πρόσωπο;». */
export const HELPERS_LABEL = "Ποιον μπορώ να καλέσω;";
export const HELPERS_NEXT_LABEL = "Αν δεν απαντήσει, ποιο είναι το επόμενο πρόσωπο;";
export const HELPERS_MAX = 4;

/** Οι 7 ερωτήσεις με τη σειρά που τις βλέπει το μέλος (τα τρία πρώτα πεδία, οι άνθρωποι, τα δύο τελευταία). */
export const PLAN_ORDER: (PlanFieldKey | "helperList")[] = ["warningSigns", "myCoping", "distractions", "helperList", "safeEnvironment", "reasons"];

export type Helper = { name: string; phone: string };
/** «Το συζητήσαμε με το μέλος»: μόνο προσθήκη, ποτέ σβήσιμο (όνομα και ώρα σε κάθε καταχώρηση). */
export type PlanDiscussed = { at: string; byId: string; byName: string };
export type PlanData = Partial<Record<PlanFieldKey | "helpers", string>> & { helperList?: Helper[]; discussed?: PlanDiscussed[] };

/** Άνθρωποι με όνομα ή τηλέφωνο, με τη σειρά τους (1ος, 2ος…). */
export function planHelpers(p: PlanData | null | undefined): Helper[] {
  return (p?.helperList ?? []).filter((h) => h.name || h.phone);
}

/** Έχει γραφτεί κάτι; (κενό πλάνο = μόνο η γραμμή στη βάση) */
export function hasPlanContent(p: PlanData | null | undefined): boolean {
  if (!p) return false;
  return PLAN_FIELDS.some((f) => Boolean(p[f.key]?.trim())) || planHelpers(p).length > 0 || Boolean(p.helpers?.trim());
}

/**
 * Ποιες από τις 7 ερωτήσεις είναι κενές (ετικέτες, με τη σειρά του μέλους). Η λίστα ανθρώπων μετράει κενή αν
 * δεν υπάρχει κανένα όνομα — το παλιό ελεύθερο κείμενο «helpers» δεν τη συμπληρώνει (να περάσει στα ονόματα από άνθρωπο).
 */
export function missingSections(p: PlanData | null | undefined): string[] {
  const out: string[] = [];
  for (const k of PLAN_ORDER) {
    if (k === "helperList") {
      if (!planHelpers(p).some((h) => h.name.trim())) out.push(HELPERS_LABEL);
    } else if (!p?.[k]?.trim()) {
      out.push(PLAN_FIELDS.find((f) => f.key === k)!.label);
    }
  }
  return out;
}

/** Τελευταία ανασκόπηση: η πιο πρόσφατη από την τελευταία αλλαγή και το τελευταίο «συζητήθηκε με το μέλος». */
export function lastReviewAt(updatedAt: Date | null | undefined, p: PlanData | null | undefined): Date | null {
  let best = updatedAt ?? null;
  for (const d of p?.discussed ?? []) {
    const t = new Date(d.at);
    if (!Number.isNaN(t.getTime()) && (!best || t > best)) best = t;
  }
  return best;
}

/** Το πιο πρόσφατο «συζητήθηκε». */
export function lastDiscussed(p: PlanData | null | undefined): PlanDiscussed | null {
  const list = (p?.discussed ?? []).filter((d) => !Number.isNaN(new Date(d.at).getTime()));
  if (list.length === 0) return null;
  return list.reduce((a, b) => (new Date(b.at) > new Date(a.at) ? b : a));
}
