"use client";

import { useEffect, useState } from "react";
import { DEFENSES, JOURNALING, MOOD, type NoteForm, noteFormSchema, PRESENTED, PROCESS, SELF_HELP, THEMES } from "@/lib/note-form";

type Props = { action: (formData: FormData) => void; hidden: Record<string, string>; initial: Partial<NoteForm> | null; themeForms: string[] };

// Το σημειωματάριο της ατομικής: γρήγορες επιλογές + χώρος για δικά σου λόγια.
// Στέλνει όλο το σημείωμα ως JSON (payload)· ο server το ελέγχει (note-form.ts).
export function NoteFormClient({ action, hidden, initial, themeForms }: Props) {
  const [d, setD] = useState<Partial<NoteForm>>({ came: true, sober: true, safeOk: true, notify: false, ...initial });
  const set = <K extends keyof NoteForm>(k: K, v: NoteForm[K]) => {
    setTouched(true);
    setD((x) => ({ ...x, [k]: v }));
  };
  const toggle = (k: "presented" | "brought" | "defenses", v: string) =>
    setD((x) => {
      const cur = (x[k] as string[] | undefined) ?? [];
      setTouched(true);
      return { ...x, [k]: cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v] };
    });
  const notify = d.notify || !d.safeOk || Boolean(d.concern?.trim());
  // Ο έλεγχος γίνεται εδώ πριν φύγει: αν λείπει κάτι, το σημείωμα μένει όπως είναι (δεν αδειάζει).
  const [problem, setProblem] = useState("");
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const r = noteFormSchema.safeParse({ ...d, notify });
    const msg = !r.success ? (r.error.issues[0]?.message ?? "Κάτι λείπει.") : !navigator.onLine ? "Δεν υπάρχει σύνδεση στο ίντερνετ· πάτα ξανά μόλις επανέλθει." : "";
    setProblem(msg);
    if (msg) e.preventDefault();
  };

  // Πρόχειρο στη συγκεκριμένη καρτέλα του browser (όχι μόνιμα στη συσκευή· σβήνει όταν κλείσει η καρτέλα):
  // αν πέσει η σύνδεση ή λήξει η είσοδος, μετά την επιστροφή το σημείωμα ξαναβρίσκεται.
  const draftKey = hidden.slotId ? `note-draft:${hidden.slotId}` : "";
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        setD(JSON.parse(raw) as Partial<NoteForm>);
        setRestored(true);
      }
    } catch {}
  }, [draftKey]);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!draftKey || !touched) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(d));
    } catch {}
  }, [d, draftKey, touched]);

  const single = (k: "mood" | "selfHelp" | "process" | "journaling", opts: readonly string[]) => (
    <div className="chips">
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={d[k] === o} onClick={() => set(k, (d[k] === o ? undefined : o) as never)}>{o}</button>
      ))}
    </div>
  );
  const multi = (k: "presented" | "brought" | "defenses", opts: readonly string[]) => (
    <div className="chips">
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={((d[k] as string[] | undefined) ?? []).includes(o)} onClick={() => toggle(k, o)}>{o}</button>
      ))}
    </div>
  );
  const text = (k: keyof NoteForm, label: string, ph?: string, rows = 3) => (
    <textarea aria-label={label} placeholder={ph} rows={rows} style={{ minHeight: rows * 24 + 20, marginTop: 8 }} value={(d[k] as string | undefined) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
  );
  const toggleRow = (k: "came" | "sober" | "safeOk" | "notify", label: string) => {
    const on = k === "notify" ? notify : Boolean(d[k]);
    return (
      <div className="row spread" style={{ flexWrap: "nowrap" }}>
        <span>{label}</span>
        <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => set(k, !on as never)} />
      </div>
    );
  };

  return (
    <form action={action} onSubmit={check} className="note-form">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="payload" value={JSON.stringify({ ...d, notify })} />
      {restored && <div className="notice">Βρέθηκε πρόχειρο που δεν είχε αποθηκευτεί — συνέχισε από εκεί.</div>}

      <fieldset>{toggleRow("came", "Ήρθε στην ατομική")}{d.came === false && <p className="muted small" style={{ margin: "6px 0 0" }}>Δεν μετράει ως παρουσία. Γράψε μόνο ό,τι χρειάζεται (π.χ. αν ενημέρωσε, τι κάνουμε).</p>}</fieldset>
      <fieldset><legend>Πώς παρουσιάστηκε</legend>{multi("presented", PRESENTED)}{text("presentedText", "Πώς παρουσιάστηκε, με λόγια", "π.χ. έντονη, συνεχής ροή λόγου", 1)}</fieldset>
      <fieldset><legend>Διάθεση</legend>{single("mood", MOOD)}</fieldset>
      <fieldset><legend>Πόσο βοηθά τον εαυτό του/της</legend>{single("selfHelp", SELF_HELP)}</fieldset>
      <fieldset><legend>Πώς νιώθει μέσα στη διαδικασία</legend>{single("process", PROCESS)}</fieldset>
      <fieldset><legend>Τι έφερε</legend>{multi("brought", [...themeForms, ...THEMES])}{text("broughtText", "Τι έφερε, με λόγια", "Με δικά σου λόγια")}</fieldset>
      <fieldset><legend>Σε τι επικεντρώθηκε η παρέμβαση</legend>{text("intervention", "Σε τι επικεντρώθηκε η παρέμβαση", "π.χ. να μείνει στο δικό του/της συναίσθημα")}</fieldset>
      <fieldset><legend>Ανταπόκριση και άμυνες</legend>{multi("defenses", DEFENSES)}{text("response", "Ανταπόκριση με λόγια", "π.χ. περιορισμένη ανταπόκριση στην ανατροφοδότηση", 1)}</fieldset>
      <fieldset><legend>Τα θετικά</legend>{text("positives", "Τα θετικά", "π.χ. επέλεξε να φύγει νωρίς", 1)}</fieldset>
      <fieldset><legend>Γράφει απογραφές;</legend>{single("journaling", JOURNALING)}</fieldset>
      <fieldset><legend>Πώς ήταν να είμαι μαζί του/της σήμερα <span className="muted small">προαιρετικό</span></legend>{text("felt", "Πώς ήταν να είμαι μαζί του/της σήμερα", "Ως παρατήρηση για τη σχέση", 2)}</fieldset>
      <fieldset><legend>Τι προτείναμε</legend>{text("suggested", "Τι προτείναμε", "Φαίνεται στον επόμενο θεραπευτή", 1)}</fieldset>
      <fieldset>
        {toggleRow("sober", "Νηφάλιος/α από την προηγούμενη φορά")}
        {!d.sober && (
          <label style={{ marginTop: 8 }}>Νέα ημερομηνία νηφαλιότητας
            <input type="date" value={d.newSoberSince ?? ""} onChange={(e) => set("newSoberSince", e.target.value as never)} required />
          </label>
        )}
        <div style={{ height: 10 }} />
        {toggleRow("safeOk", "Ασφάλεια: χωρίς ανησυχία")}
      </fieldset>
      <fieldset>
        <legend>Προβληματισμός προς τη θεραπευτική ομάδα{!d.safeOk && <span style={{ color: "var(--red)" }}> · υποχρεωτικό: τι ανησυχεί και ποιος ενημερώθηκε</span>}</legend>
        {text("concern", "Προβληματισμός προς τη θεραπευτική ομάδα", "Αν γράψεις εδώ, ενημερώνεται αμέσως η ομάδα")}
      </fieldset>
      <fieldset>{toggleRow("notify", "Ενημέρωση ομάδας θεραπευτών τώρα")}</fieldset>
      <fieldset>
        {problem && <div className="error" role="alert" style={{ marginBottom: 10 }}>Δεν αποθηκεύτηκε ακόμα: {problem} Ό,τι έγραψες είναι εδώ.</div>}
        <button className="primary" type="submit" style={{ width: "100%", padding: 14 }}>Αποθήκευση σημειώματος</button>
        <p className="muted small" style={{ margin: "8px 0 0" }}>Αποθηκεύεται με όνομα και ώρα. Κάθε αλλαγή κρατά την προηγούμενη μορφή.</p>
      </fieldset>
    </form>
  );
}
