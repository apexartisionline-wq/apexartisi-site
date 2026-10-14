/**
 * Δωμάτια Zoom (14/10, από τη δοκιμή της υπεύθυνης: το «Άνοιγμα Zoom» οδηγούσε στο zoom.us/ — γενική αρχική σελίδα).
 * Έγκυρος σύνδεσμος δωματίου = πλήρης διεύθυνση https με διαδρομή (π.χ. https://us02web.zoom.us/j/123…), όχι σκέτο domain.
 * Ό,τι δεν είναι έγκυρο θεωρείται «δεν έχει οριστεί»: κανένα κουμπί δεν ανοίγει γενική σελίδα.
 */
export function roomUrl(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return "";
    if (u.pathname.replace(/\/+$/, "").length < 2) return ""; // μόνο «/» ή κενό: αρχική σελίδα, όχι δωμάτιο
    return u.toString();
  } catch {
    return "";
  }
}

export const ROOM_MISSING = "Το δωμάτιο Zoom δεν έχει οριστεί ακόμα (η διαχείριση το βάζει στις «Ρυθμίσεις» → Δωμάτια).";
export const ROOM_MISSING_MEMBER = "Το δωμάτιο δεν έχει οριστεί ακόμα. Η ομάδα σου θα το φτιάξει· αν βιάζεσαι, πες το της.";
