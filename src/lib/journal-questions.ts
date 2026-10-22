// Το πραγματικό «Ημερολόγιο της Ανάκαμψής μου» (τετράδιο v2, 16/9/2026 — υπεύθυνη 22/10: «βάλε το πραγματικό ημερολόγιο
// ανάκαμψης, τις ερωτήσεις κι αυτά που έχουμε γραμμένα — το έχεις κάνει πολύ μικρό»). Οι 18 ερωτήσεις κάθε βραδιού,
// αυτούσιες από το τετράδιο. Οι αριθμητικές και οι ερωτήσεις ασφάλειας μένουν στις υπάρχουσες στήλες της βάσης (ώστε
// «Με μια ματιά», «Συνέπεια», σήματα και σύνοψη κύκλου να δουλεύουν όπως πριν): 2 → mood, 3 → sleepHours, 4 → used,
// 5 → craving (0 όταν «Όχι»), 12 → win, 16 → confidence, 18 → selfHarm. Οι υπόλοιπες → `answers` (κρυπτογραφημένο JSON).

export const WAKE = [
  "Γεμάτος/η ενέργεια και διάθεση",
  "Καλά, αλλά λίγο κουρασμένος/η",
  "Ουδέτερα",
  "Δύσκολα, χρειάστηκα χρόνο",
  "Με άγχος ή αρνητικές σκέψεις",
] as const;

export const REACTION = [
  "Τεχνική (αναπνοή, παύση, κίνηση)",
  "Ζήτησα βοήθεια",
  "Άλλαξα περιβάλλον",
  "Παρορμητικά",
  "Απέφυγα ή αποσύρθηκα",
  "Άλλο",
] as const;

export const SELF_CARE = [
  "Περπάτησα",
  "Γυμνάστηκα",
  "Μίλησα σε φίλο ή στην ομάδα",
  "Ξεκουράστηκα",
  "Κοιμήθηκα αρκετά",
  "Έβαλα ένα όριο",
  "Κάτι που με ευχαριστεί",
  "Έφαγα κανονικά",
  "Τίποτα σήμερα",
] as const;

export const VALUES = { YES: "Ναι", NO: "Όχι", PARTLY: "Εν μέρει" } as const;

/** Ερώτηση 18, με τη σειρά του τετραδίου → τιμή της στήλης selfHarm. */
export const SELF_HARM_CHOICES = [
  { value: "NO", label: "Όχι" },
  { value: "PASSING", label: "Πέρασε μια σκέψη, αλλά έφυγε" },
  { value: "YES", label: "Ναι" },
  { value: "UNSURE", label: "Δεν είμαι σίγουρος/η" },
] as const;

/** Οι απαντήσεις που δεν έχουν δική τους στήλη. Όλα προαιρετικά, για να διαβάζονται και παλιές καταχωρίσεις. */
export type JournalAnswers = {
  wake?: string; // 1
  cravingAny?: boolean; // 5 (ναι/όχι)
  cravingWhere?: string; // 6
  cravingCoping?: string; // 7
  challenge?: string; // 8
  reaction?: string[]; // 9
  reactionNote?: string; // 9 (λίγα λόγια, όπως στη φόρμα)
  pattern?: string; // 10
  selfCare?: string[]; // 11
  values?: keyof typeof VALUES; // 13
  gratitude?: string; // 14
  learned?: string; // 15
  tomorrow?: string; // 17
};

export function parseAnswers(json: string): JournalAnswers {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as JournalAnswers) : {};
  } catch {
    return {};
  }
}

/** Οι ερωτήσεις με κείμενο, με τη σειρά και τα λόγια του τετραδίου (για την προβολή στην ομάδα). */
export const TEXT_QUESTIONS: { key: keyof JournalAnswers; n: number; label: string }[] = [
  { key: "cravingWhere", n: 6, label: "Αν ένιωσα λαχτάρα: πού ήμουν και τι είχε προηγηθεί;" },
  { key: "cravingCoping", n: 7, label: "Αν ένιωσα λαχτάρα: τι έκανα για να τη διαχειριστώ;" },
  { key: "challenge", n: 8, label: "Η μεγαλύτερη πρόκληση της ημέρας" },
  { key: "reactionNote", n: 9, label: "Πώς αντέδρασα — λίγα λόγια" },
  { key: "pattern", n: 10, label: "Παρατήρησα κάτι που επαναλαμβάνεται σε εμένα;" },
  { key: "gratitude", n: 14, label: "Για τι νιώθω ευγνωμοσύνη σήμερα;" },
  { key: "learned", n: 15, label: "Τι έμαθα σήμερα για τον εαυτό μου;" },
  { key: "tomorrow", n: 17, label: "Τι μπορεί να με δυσκολέψει αύριο, και τι θα κάνω αν συμβεί;" },
];
