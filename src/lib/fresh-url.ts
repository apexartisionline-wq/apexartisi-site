/**
 * Μετά από ανάληψη/ολοκλήρωση ενέργειας η σελίδα πρέπει να ξαναφορτώσει με ΦΡΕΣΚΑ δεδομένα (17/10): με redirect στην ίδια
 * ακριβώς διεύθυνση ο router του Next έδειχνε την παλιά κατάσταση («Εκκρεμεί ανάληψη») μέχρι να ανανεώσει κανείς τη σελίδα.
 * Μια μικρή αλλαγή στη διεύθυνση (r=…) αναγκάζει νέα φόρτωση· το r το αγνοούν οι σελίδες και δεν σωρεύεται (αντικαθίσταται).
 */
export function fresh(url: string): string {
  const [path, q = ""] = url.split("?");
  const params = new URLSearchParams(q);
  params.set("r", Date.now().toString(36));
  return `${path}?${params.toString()}`;
}
