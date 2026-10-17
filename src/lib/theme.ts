// Χρωματικό θέμα (υπεύθυνη 17/10): «η εφαρμογή να έχει πάντα λευκό φόντο» και «κάθε ρόλος να μπορεί να αλλάξει το θέμα».
// Προεπιλογή ΠΑΝΤΑ το φωτεινό, ανεξάρτητα από τη ρύθμιση της συσκευής· το σκούρο μόνο με επιλογή του ίδιου του χρήστη
// («Λογαριασμός» → «Εμφάνιση»). Αποθηκεύεται στον λογαριασμό (User.theme) και σε cookie, ώστε η σελίδα να βγαίνει
// σωστή από τον server χωρίς αναβόσβημα· στην είσοδο το cookie παίρνει την τιμή του λογαριασμού.
export const THEMES = { light: "Φωτεινό", dark: "Σκούρο" } as const;
export type Theme = keyof typeof THEMES;
export const THEME_COOKIE = "apex_theme";
export const isTheme = (x: unknown): x is Theme => x === "light" || x === "dark";
export const themeOf = (x: unknown): Theme => (isTheme(x) ? x : "light");
