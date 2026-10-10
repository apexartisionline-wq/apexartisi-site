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
  if (!parsed.success) redirect(`/m/profile?missing=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("|"))}`);
  await saveProfile(user.id, user.id, parsed.data);
  redirect("/m/profile?saved=1");
}

// Πριν την 1η ατομική: λίγα στοιχεία για την ασφάλεια του μέλους. Τα βλέπει μόνο η διαχείριση
// (και ο/η ψυχολόγος στην 1η ατομική, για να τα επιβεβαιώσετε μαζί).
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; missing?: string }> }) {
  const user = await requireRole("MEMBER");
  const sp = await searchParams;
  const p = (await latestProfile(user.id))?.data;
  const today = new Date().toISOString().slice(0, 10);
  const f = (name: keyof NonNullable<typeof p>, label: string, o: { type?: string; why?: string; required?: boolean; pattern?: string; max?: string; mode?: "tel" | "email" } = {}) => (
    <div className="field">
      <label htmlFor={name}>{label}{o.required ? "" : <span className="muted small"> · προαιρετικό</span>}</label>
      <input id={name} name={name} type={o.type ?? "text"} defaultValue={(p?.[name] as string) ?? ""} autoComplete="off" required={o.required} pattern={o.pattern} max={o.max} inputMode={o.mode} />
      {o.why && <div className="muted small">{o.why}</div>}
    </div>
  );
  const tel = "\\+?[0-9 ]{10,15}";
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href="/m/start">‹ Πίσω</Link></p>
      <h1>Πριν την 1η ατομική</h1>
      <p className="muted">
        Λίγα στοιχεία για την ασφάλειά σου. Μετά την 1η ατομική τα βλέπει <strong>μόνο η διαχείριση του προγράμματος</strong> — όχι οι ψυχολόγοι και σύμβουλοι και όχι τα άλλα μέλη.
        Στην 1η ατομική τα επιβεβαιώνεις με τον/την ψυχολόγο. Μόνο αν κινδυνεύει η ζωή σου, ο/η ψυχολόγος μπορεί να δει τη διεύθυνση και την επαφή έκτακτης ανάγκης· αυτό καταγράφεται και το βλέπει η διαχείριση.
      </p>
      {sp.saved && <div className="notice">Αποθηκεύτηκαν ✓ Ευχαριστούμε. Μπορείς να τα αλλάξεις όποτε θέλεις.</div>}
      {sp.missing && (
        <div className="error">
          Δεν αποθηκεύτηκαν ακόμα. Λείπει ή δεν φαίνεται σωστό:
          <ul style={{ margin: "6px 0 0" }}>{sp.missing.split("|").map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <form action={save}>
        <h2>Εσύ</h2>
        <div className="card">
          {f("fullName", "Ονοματεπώνυμο", { required: true })}
          {f("preferredName", "Πώς θέλεις να σε λέμε")}
          {f("birthDate", "Ημερομηνία γέννησης", { type: "date", required: true, max: today, why: "Για να ξέρουμε ότι είσαι ενήλικας." })}
          {f("mobile", "Κινητό", { type: "tel", mode: "tel", required: true, pattern: tel, why: "Για να σε βρούμε αν κάτι αλλάξει στο πρόγραμμα ή αν ανησυχήσουμε για σένα." })}
          {f("email", "Email", { type: "email", mode: "email" })}
        </div>
        <h2>Πού μένεις</h2>
        <div className="card">
          {f("address", "Διεύθυνση κατοικίας", { required: true, why: "Οδός, αριθμός, όροφος, πόλη, Τ.Κ. — μόνο για να στείλουμε βοήθεια αν κινδυνεύεις σε ώρα συνεδρίας." })}
          {f("abroadCountry", "Αν ζεις εκτός Ελλάδας: σε ποια χώρα", { why: "Εκεί ισχύει άλλος αριθμός έκτακτης ανάγκης." })}
        </div>
        <h2>Ένας άνθρωπος για έκτακτη ανάγκη</h2>
        <p className="muted small" style={{ margin: "0 4px 8px" }}>
          Προαιρετικό, αλλά μας βοηθά να σε προστατέψουμε. Δεν θα του/της πούμε ότι είσαι στο πρόγραμμα, εκτός αν το επιτρέψεις παρακάτω.
        </p>
        <div className="card">
          {f("ecName", "Όνομα")}
          {f("ecRelation", "Σχέση (π.χ. αδελφή, φίλος)")}
          {f("ecPhone", "Τηλέφωνο", { type: "tel", mode: "tel", pattern: tel })}
          <div className="field">
            <label>Πότε μπορούμε να τον/την καλέσουμε</label>
            {Object.entries(EC_WHEN).map(([k, v]) => (
              <label key={k} className="row" style={{ gap: 8, fontWeight: 400 }}>
                <input type="radio" name="ecWhen" value={k} defaultChecked={p?.ecWhen === k} style={{ width: "auto" }} /> {v}
              </label>
            ))}
          </div>
          {f("ecWhatToSay", "Τι επιτρέπεται να του/της πούμε", { why: "π.χ. μόνο ότι ανησυχούμε για την ασφάλειά μου" })}
        </div>
        <button className="primary big" type="submit" style={{ marginTop: 14, width: "100%" }}>Αποθήκευση</button>
        <div style={{ height: 80 }} />
      </form>
    </main>
  );
}
