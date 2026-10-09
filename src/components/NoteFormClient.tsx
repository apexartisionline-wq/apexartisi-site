"use client";

import { useEffect, useState } from "react";
import { ThemeDetails, type ThemeDetail } from "@/components/ThemeDetails";
import { useNoteForm } from "./useNoteForm";
import { DEFENSES, JOURNALING, MOOD, type NoteForm, noteFormSchema, PRESENTED, PROCESS, SELF_HELP, THEMES } from "@/lib/note-form";

type Props = { action: (formData: FormData) => void; hidden: Record<string, string>; initial: Partial<NoteForm> | null; themeForms: string[]; themeDetails?: ThemeDetail[]; cameDefault?: boolean };

// Το σημειωματάριο της ατομικής: γρήγορες επιλογές + χώρος για δικά σου λόγια.
// Στέλνει όλο το σημείωμα ως JSON (payload)· ο server το ελέγχει (note-form.ts).
export function NoteFormClient({ action, hidden, initial, themeForms, themeDetails = [], cameDefault }: Props) {
  // «Ήρθε»: ξεκινά «Ναι» μόνο αν το μέλος πάτησε «Σύνδεση» (ή αν υπάρχει ήδη σημείωμα)· αλλιώς το διαλέγει ο θεραπευτής.
  // Σε διόρθωση ο διακόπτης «Ενημέρωση ομάδας» ξεκινά κλειστός: η ομάδα ενημερώθηκε ήδη την πρώτη φορά.
  const [d, setD] = useState<Partial<NoteForm>>({ came: initial ? (initial.came ?? true) : cameDefault ? true : undefined, sober: true, safeOk: true, ...initial, notify: false });
  const editing = Boolean(initial);
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
  const notify = Boolean(d.notify);
  // «Δεν ήρθε»: φεύγουν μόνο τα πεδία που φαίνονται (όχι κλινικά που γράφτηκαν πριν αλλάξει σε «Δεν ήρθε»).
  const payload = d.came === false
    ? { came: false, absentText: d.absentText, sober: true, safeOk: d.safeOk, safetyText: d.safetyText, concern: d.concern, notify }
    : { ...d, notify };
  // Ο έλεγχος γίνεται εδώ πριν φύγει: αν λείπει κάτι, το σημείωμα μένει όπως είναι (δεν αδειάζει).
  const formRef = useNoteForm();
  const [problem, setProblem] = useState("");
  const [warnedEmpty, setWarnedEmpty] = useState("");
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const r = noteFormSchema.safeParse(payload);
    let msg = d.came === undefined ? "Διάλεξε «Ήρθε» ή «Δεν ήρθε»." : !r.success ? (r.error.issues[0]?.message ?? "Κάτι λείπει.") : !navigator.onLine ? "Δεν υπάρχει σύνδεση στο ίντερνετ· πάτα ξανά μόλις επανέλθει." : "";
    // Ήπια υπενθύμιση για κενά· με δεύτερο πάτημα αποθηκεύεται έτσι.
    if (!msg && d.came !== false && !editing) {
      const empty = ([["positives", "Τα θετικά"], ["suggested", "Τι προτείναμε"]] as const).filter(([k]) => !String(d[k] ?? "").trim()).map(([, l]) => `«${l}»`).join(", ");
      if (empty && empty !== warnedEmpty) {
        setWarnedEmpty(empty);
        msg = `Δεν έγραψες ${empty}. Αν θέλεις να αποθηκευτεί έτσι, πάτα ξανά «Αποθήκευση».`;
      }
    }
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
  // Δύο κουμπιά με λέξεις (χωρίς διακόπτη): για «Ήρθε» και για την ανησυχία ασφάλειας.
  const pick2 = (label: string, opts: [string, boolean][], value: boolean | undefined, onPick: (v: boolean) => void) => (
    <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
      <span>{label}</span>
      <span className="chips" role="group" aria-label={label}>
        {opts.map(([l, v]) => <button key={l} type="button" className="chip" aria-pressed={value === v} onClick={() => onPick(v)}>{l}</button>)}
      </span>
    </div>
  );
  const toggleRow = (k: "came" | "sober" | "safeOk" | "notify", label: string) => {
    const on = Boolean(d[k]);
    return (
      <div className="row spread" style={{ flexWrap: "nowrap" }}>
        <span>{label}</span>
        <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <span className="small muted" aria-hidden>{on ? "Ναι" : "Όχι"}</span>
          <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => set(k, !on as never)} />
        </span>
      </div>
    );
  };

  return (
    <form ref={formRef} action={action} onSubmit={check} className="note-form" id="notebook">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {restored && <div className="notice">Βρέθηκε πρόχειρο που δεν είχε αποθηκευτεί — συνέχισε από εκεί.</div>}

      <fieldset>{pick2("Ήρθε στην ατομική;", [["Ήρθε", true], ["Δεν ήρθε", false]], d.came, (v) => set("came", v as never))}{d.came === false && <p className="muted small" style={{ margin: "6px 0 0" }}>Δεν μετράει ως παρουσία. Γράψε μόνο ό,τι χρειάζεται (π.χ. αν ενημέρωσε, τι κάνουμε).</p>}</fieldset>
      {d.came === false ? (
        <fieldset><legend>Τι έγινε / τι κάνουμε</legend>{text("absentText", "Τι έγινε / τι κάνουμε", "π.χ. ενημέρωσε το πρωί ότι είναι άρρωστος· θα κλείσει νέα ώρα", 2)}</fieldset>
      ) : (
        <>
      <fieldset><legend>Πώς παρουσιάστηκε</legend>{multi("presented", PRESENTED)}{text("presentedText", "Πώς παρουσιάστηκε, με λόγια", "π.χ. έντονη, συνεχής ροή λόγου", 1)}</fieldset>
      <fieldset><legend>Διάθεση</legend>{single("mood", MOOD)}</fieldset>
      <fieldset><legend>Πόσο βοηθά τον εαυτό του/της</legend>{single("selfHelp", SELF_HELP)}</fieldset>
      <fieldset><legend>Πώς νιώθει μέσα στη διαδικασία</legend>{single("process", PROCESS)}</fieldset>
      <fieldset><legend>Τι έφερε</legend>{multi("brought", [...themeForms, ...THEMES])}<ThemeDetails items={themeDetails} intro="Η θεματική της εβδομάδας, για να τη δεις εδώ:" />{text("broughtText", "Τι έφερε, με λόγια", "Με δικά σου λόγια")}</fieldset>
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
          </fieldset>
        </>
      )}
      <fieldset>
        {pick2("Ανησυχία για την ασφάλεια;", [["Όχι", true], ["Ναι", false]], d.safeOk, (v) => set("safeOk", v as never))}
        {!d.safeOk && (
          <div className="must">
            <label htmlFor="safetyText">Τι ανησυχεί και ποιος ενημερώθηκε <span>· υποχρεωτικό</span></label>
            <textarea id="safetyText" rows={2} style={{ minHeight: 68 }} placeholder="π.χ. σκέψεις χωρίς σχέδιο· ενημέρωσα τηλεφωνικά τη Δήμητρα (ψυχολόγο) 10:50" value={d.safetyText ?? ""} onChange={(e) => set("safetyText", e.target.value as never)} />
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Προβληματισμός προς τη θεραπευτική ομάδα</legend>
        {text("concern", "Προβληματισμός προς τη θεραπευτική ομάδα", "Αν γράψεις εδώ, ενημερώνεται αμέσως η ομάδα")}
      </fieldset>
      <fieldset>{toggleRow("notify", "Ενημέρωση ομάδας θεραπευτών τώρα")}<div className="small muted" style={{ marginTop: 4 }}>Βάζει μία κίτρινη γραμμή για 24 ώρες στο «Σήμερα» της ομάδας (το ίδιο γίνεται μόνο του με «Ανησυχία: Ναι» ή προβληματισμό). Δεν στέλνει τίποτα στο μέλος.{editing && " Σε διόρθωση, η ομάδα ενημερώνεται ξανά μόνο αν γράψεις κάτι καινούργιο."}</div></fieldset>
      <fieldset>
        {problem && <div className="error" role="alert" style={{ marginBottom: 10 }}>Δεν αποθηκεύτηκε ακόμα: {problem} Ό,τι έγραψες είναι εδώ.</div>}
        <button className="primary" type="submit" style={{ width: "100%", padding: 14 }}>Αποθήκευση σημειώματος</button>
        <p className="muted small" style={{ margin: "8px 0 0" }}>Αποθηκεύεται με όνομα και ώρα. Κάθε αλλαγή κρατά την προηγούμενη μορφή.</p>
      </fieldset>
    </form>
  );
}
