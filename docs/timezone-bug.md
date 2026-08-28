# Bug: τα ραντεβού μπαίνουν 1 ώρα αργότερα στο ημερολόγιο

Ημερομηνία ανάλυσης: 28/08/2026

## Σύνοψη

Ο πελάτης κλείνει π.χ. **19:00** (ώρα Ελλάδας), παίρνει email που λέει **19:00**,
αλλά το Google Calendar γράφει το ραντεβού στις **20:00**.

Η αιτία **δεν** είναι το Calendly. Είναι το σύστημα κρατήσεων σε **Google Apps Script**
(Stripe → Apps Script → Sheet + Google Calendar + emails), του οποίου η **ζώνη ώρας
είναι Europe/Madrid** αντί για Europe/Athens.

Μαδρίτη και Ελλάδα έχουν πάντα ακριβώς **1 ώρα** διαφορά (και οι δύο ακολουθούν την
ίδια θερινή ώρα ΕΕ), οπότε το σφάλμα είναι σταθερά +1 ώρα όλο τον χρόνο.

## Αποδείξεις

Πηγή αλήθειας: το φύλλο `Κρατήσεις — ΑΥΤΟΓΝΩΣΙΑ PLUS`, στήλη «Ώρα συνεδρίας»
(ό,τι διάλεξε ο πελάτης και ό,τι γράφει το email επιβεβαίωσης).

| Πελάτης | Κράτηση / email | Google Calendar | Διαφορά |
|---|---|---|---|
| Πολυχρονιάδου Χρύσα | 12/08/2026 19:00 | 12/08/2026 20:00–20:50 | **+1 ώρα** |
| Chrissanthi Polichroniadou | 26/08/2026 12:00 | 26/08/2026 13:00–13:50 | **+1 ώρα** |
| Vasiliki K | 26/08/2026 19:00 | 26/08/2026 20:00–20:50 | **+1 ώρα** |

Και τα τρία events δημιουργήθηκαν αυτόματα (`created` ≈ `updated`, δεν τα άγγιξε κανείς).
Σε άλλες κρατήσεις (π.χ. ΔΟΜΝΑ ΜΠΑΧΑΡΑΚΗ 07/08, Ναΐρα Μπαγκντασαριάν 03/08) το event
είχε διορθωθεί χειροκίνητα αργότερα — φαίνεται από το `updated` που είναι ώρες μετά
το `created`.

Αριθμητικά: 12:00 Μαδρίτη (CEST, UTC+2) = 10:00 UTC = **13:00** Αθήνα (EEST, UTC+3). Ταιριάζει ακριβώς.

## Τι ΔΕΝ φταίει

- **Calendly**: ελέγχθηκε πλήρως. Ο λογαριασμός και το availability schedule είναι
  `Europe/Helsinki`, που έχει **ακριβώς την ίδια ώρα** με την Ελλάδα. Η αλυσίδα
  Calendly → email → Google Calendar επαληθεύτηκε σωστή (κράτηση Ioannis 28/08:
  email «19:00», ημερολόγιο 19:00 Αθήνας).
- **Google Calendar**: όλα τα ημερολόγια είναι `Europe/Athens`.
- **Το repo `apexartisi-site`**: δεν περιέχει κώδικα κρατήσεων (μόνο README).

## Η διόρθωση

### 1. Ζώνη ώρας του Apps Script project (το κύριο)

Άνοιξε το script → ⚙️ **Ρυθμίσεις έργου** → **Ζώνη ώρας** →
`(GMT+02:00) Αθήνα` / `Europe/Athens`.

Ισοδύναμα, στο `appsscript.json`:

```json
{
  "timeZone": "Europe/Athens"
}
```

Υποψήφια projects στο Drive του λογαριασμού (δεν μπόρεσα να διαβάσω τον πηγαίο
κώδικα — το Drive API δεν εξάγει περιεχόμενο Apps Script):

- `Έργο χωρίς τίτλο` — `160MRWvETjgsf0AbyvTXQB7nIgkQPgwxuGsc30nW4LVJ0RdHcCThI6pRC` (πιο πρόσφατο, 24/08/2026)
- `σύστημα κρατήσεων` — `1lG1TJbG1hAl32cXGajJCTDq_y0fy4L3IZuoR4giU8Yup93bN4JNmIWkV`
- `hmerologio` — `1Fy-qL4rTc_W3flllzAshWxVemBFvgPNu5BOWEMQ5BW_Zqx0cbx0wihd8`

### 2. Ζώνη ώρας του Spreadsheet

Στο `Κρατήσεις — ΑΥΤΟΓΝΩΣΙΑ PLUS`:
**Αρχείο → Ρυθμίσεις → Ζώνη ώρας → Athens**.

Αν το φύλλο είναι σε Μαδρίτη, μια ώρα «19:00» που διαβάζει το script γίνεται
19:00 Μαδρίτης = 20:00 Αθήνας — ίδιο σφάλμα από άλλη πόρτα.

### 3. Ψάξε τυχόν hardcoded τιμή στον κώδικα

Στον editor: `Ctrl+F` → `Madrid`. Αν υπάρχει `'Europe/Madrid'`, άλλαξέ το σε `'Europe/Athens'`.

### 4. Κάν' το αδιάφορο ως προς τη ζώνη ώρας (συνιστάται)

Μην βασίζεσαι στη ζώνη του project. Δώσε ρητά το timezone στο Calendar API
(Υπηρεσίες → πρόσθεσε `Calendar` advanced service):

```js
const TZ = 'Europe/Athens';

// startLocal/endLocal σε μορφή 'YYYY-MM-DDTHH:mm:00' — τοπική ώρα Ελλάδας
Calendar.Events.insert({
  summary: title,
  description: desc,
  start: { dateTime: startLocal, timeZone: TZ },
  end:   { dateTime: endLocal,   timeZone: TZ },
  attendees: [{ email: clientEmail }]
}, 'primary');
```

Και για τη μορφοποίηση σε emails, πάντα ρητά:

```js
Utilities.formatDate(startDate, TZ, "EEEE d MMMM yyyy, HH:mm");
```

Έτσι, ακόμα κι αν ξαναταξιδέψεις, ο κώδικας παραμένει σωστός.

## Εκκρεμότητες στο ημερολόγιο

Ελέγχθηκαν όλα τα μελλοντικά ραντεβού μέχρι 30/09/2026: **δεν υπάρχει κάποιο
λανθασμένο**. Το μόνο μελλοντικό από το σύστημα κρατήσεων (Vasiliki K, 31/08 19:00)
είναι σωστό, γιατί μετακινήθηκε χειροκίνητα.

Προσοχή: η αλλαγή ζώνης ώρας **δεν** μετακινεί events που έχουν ήδη δημιουργηθεί —
επηρεάζει μόνο τις επόμενες κρατήσεις.

## Προαιρετικό: Calendly

Ο λογαριασμός Calendly είναι `Europe/Helsinki`. Λειτουργεί σωστά (ίδια ώρα με Ελλάδα),
αλλά για να μην μπερδεύεσαι, βάλ' τον `Europe/Athens` (Account Settings → Time zone).
Το ίδιο και στο availability schedule «Working hours».
