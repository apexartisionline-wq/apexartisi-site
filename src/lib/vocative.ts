// Κλητική ελληνικού μικρού ονόματος, για τα μηνύματα προς το μέλος («Κώστα,», «Νίκο,», «Αλέξανδρε,»).
// Απλοί κανόνες· η υπεύθυνη ελέγχει πάντα το μήνυμα πριν φύγει.
const VOWELS = /[αεηιουωάέήίόύώϊϋΐΰ]/gi;
const ACCENTED = /[άέήίόύώΐΰ]/i;

export function vocative(name: string): string {
  const n = name.trim();
  if (/ας$/.test(n)) return n.slice(0, -1); // Κώστας → Κώστα
  if (/ης$/.test(n)) return n.slice(0, -1); // Γιάννης → Γιάννη
  if (/ος$/.test(n)) {
    // Τονισμένη η προπαραλήγουσα (π.χ. Αλέξανδρος, Θεόδωρος) → -ε· αλλιώς → -ο (Νίκος → Νίκο).
    const syll = n.toLowerCase().replace(/ου|αι|ει|οι|αυ|ευ/g, "x").match(VOWELS)?.length ?? 0;
    const groups = n.toLowerCase().replace(/(ου|αι|ει|οι|αυ|ευ)/g, (m) => (ACCENTED.test(m) ? "ά" : "α")).match(VOWELS) ?? [];
    const accentIdx = groups.findIndex((v) => ACCENTED.test(v));
    if (syll >= 3 && accentIdx === groups.length - 3) return `${n.slice(0, -2)}ε`;
    return n.slice(0, -1);
  }
  return n; // γυναικεία και άλλα ονόματα μένουν ίδια
}
