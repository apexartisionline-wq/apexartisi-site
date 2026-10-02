import Link from "next/link";
import { redirect } from "next/navigation";
import { EC_WHEN, latestProfile, profileSchema, saveProfile } from "@/lib/assessment-db";
import { requireRole } from "@/lib/auth";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const get = (k: string) => String(formData.get(k) ?? "");
  const parsed = profileSchema.safeParse({
    fullName: get("fullName"), preferredName: get("preferredName"), birthDate: get("birthDate"), mobile: get("mobile"), email: get("email"),
    address: get("address"), abroadCountry: get("abroadCountry"),
    ecName: get("ecName"), ecRelation: get("ecRelation"), ecPhone: get("ecPhone"), ecWhen: get("ecWhen") || undefined, ecWhatToSay: get("ecWhatToSay"),
  });
  if (!parsed.success) redirect("/m/profile?error=1");
  await saveProfile(user.id, user.id, parsed.data);
  redirect("/m/profile?saved=1");
}

// Πριν την 1η ατομική: λίγα στοιχεία για την ασφάλεια του μέλους. Τα βλέπει μόνο η διαχείριση
// (και ο/η ψυχολόγος στην 1η ατομική, για να τα επιβεβαιώσετε μαζί).
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole("MEMBER");
  const sp = await searchParams;
  const p = (await latestProfile(user.id))?.data;
  const f = (name: keyof NonNullable<typeof p>, label: string, type = "text", hint?: string) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={(p?.[name] as string) ?? ""} autoComplete="off" />
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link href="/m/start">‹ Πίσω</Link></p>
      <h1>Πριν την 1η ατομική</h1>
      <p className="muted">Λίγα στοιχεία για την ασφάλειά σου. Τα βλέπει μόνο η γραμματεία του προγράμματος· στην 1η ατομική τα επιβεβαιώνεις με τον/την ψυχολόγο.</p>
      {sp.saved && <div className="notice">Αποθηκεύτηκαν ✓ Ευχαριστούμε.</div>}
      {sp.error && <div className="error">Κάτι δεν συμπληρώθηκε σωστά. Δες ξανά τα πεδία.</div>}
      <form action={save}>
        <h2>Εσύ</h2>
        <div className="card">
          {f("fullName", "Ονοματεπώνυμο")}
          {f("preferredName", "Πώς θέλεις να σε λέμε")}
          {f("birthDate", "Ημερομηνία γέννησης", "date")}
          {f("mobile", "Κινητό", "tel")}
          {f("email", "Email", "email")}
        </div>
        <h2>Πού βρίσκεσαι</h2>
        <div className="card">
          {f("address", "Διεύθυνση κατοικίας", "text", "Οδός, αριθμός, όροφος, πόλη, ΤΚ — μόνο για να στείλουμε βοήθεια αν κινδυνεύεις σε ώρα συνεδρίας.")}
          {f("abroadCountry", "Αν ζεις εκτός Ελλάδας: σε ποια χώρα")}
        </div>
        <h2>Ένας άνθρωπος για έκτακτη ανάγκη</h2>
        <div className="card">
          {f("ecName", "Όνομα")}
          {f("ecRelation", "Σχέση (π.χ. αδελφή)")}
          {f("ecPhone", "Τηλέφωνο", "tel")}
          <div className="field">
            <label>Πότε μπορούμε να τον/την καλέσουμε</label>
            {Object.entries(EC_WHEN).map(([k, v]) => (
              <label key={k} className="row" style={{ gap: 8, fontWeight: 400 }}>
                <input type="radio" name="ecWhen" value={k} defaultChecked={p?.ecWhen === k} style={{ width: "auto" }} /> {v}
              </label>
            ))}
          </div>
          {f("ecWhatToSay", "Τι επιτρέπεται να του/της πούμε", "text", "π.χ. μόνο ότι ανησυχούμε για την ασφάλειά μου")}
        </div>
        <button className="primary big" type="submit" style={{ marginTop: 14, width: "100%" }}>Αποθήκευση</button>
      </form>
    </main>
  );
}
