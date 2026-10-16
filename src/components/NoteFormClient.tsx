"use client";

import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { saveFailure } from "@/lib/save-failure";
import { ThemeDetails, type ThemeDetail } from "@/components/ThemeDetails";
import { FormSteps } from "@/components/FormSteps";
import { useSteps } from "@/components/NoteWorkspace";
import { SaveBar } from "@/components/SaveBar";
import { useNoteForm } from "./useNoteForm";
import { DEFENSES, JOURNALING, MOOD, NOTE_REQUIRED, type NoteForm, noteFormSchema, PRESENTED, PROCESS, SELF_HELP, THEMES } from "@/lib/note-form";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  initial: Partial<NoteForm> | null;
  themeForms: string[];
  themeDetails?: ThemeDetail[];
  cameDefault?: boolean;
  savedAt?: string; // «Αποθηκευμένο · ώρα» όταν διορθώνεται υπάρχον σημείωμα
  context?: { goal?: string | null; assignment?: string | null }; // στόχος και εργασία, για την καρτέλα «Συνέχεια»
};

export const NOTE_TABS = ["Εικόνα σήμερα", "Δουλειά στη συνεδρία", "Συνέχεια", "Ενημέρωση ομάδας"] as const;
// Μία γραμμή οδηγίας ανά βήμα (όχι κλινικό περιεχόμενο — τι καταγράφεται εδώ).
export const STEP_HINT = [
  "Παρουσία, πώς παρουσιάστηκε, νηφαλιότητα, απογραφές.",
  "Καταγράφεις μόνο όσα χρειάζονται για τη θεραπευτική συνέχεια.",
  "Τι προτείναμε, τι συμφωνήθηκε, τι έμεινε ανοιχτό, τι χρειάζεται ο επόμενος θεραπευτής.",
  "Ασφάλεια και προβληματισμός προς την ομάδα· εδώ αποθηκεύεις το σημείωμα.",
] as const;
type Tab = 0 | 1 | 2 | 3;

// Ποια καρτέλα «ανήκει» κάθε πεδίο (για να πηγαίνει το μήνυμα λάθους εκεί που χρειάζεται).
const TAB_OF: Partial<Record<keyof NoteForm, Tab>> = {
  came: 0, presented: 0, presentedText: 0, mood: 0, selfHelp: 0, process: 0, sober: 0, newSoberSince: 0, journaling: 0, absentText: 0,
  brought: 1, broughtText: 1, intervention: 1, defenses: 1, response: 1, positives: 1, felt: 1,
  suggested: 2, agreed: 2, openIssues: 2, handover: 2,
  safeOk: 3, safetyText: 3, concern: 3, notify: 3,
};

// Το σημειωματάριο της ατομικής σε τέσσερις ελεύθερα προσβάσιμες καρτέλες (13/10). Όλα τα πεδία μένουν στη μνήμη
// όσο αλλάζεις καρτέλα και αποθηκεύονται μαζί. Στέλνεται ως JSON (payload)· ο server το ελέγχει (note-form.ts).
export function NoteFormClient({ action, hidden, initial, themeForms, themeDetails = [], cameDefault, savedAt, context }: Props) {
  // «Ήρθε»: ξεκινά «Ναι» μόνο αν το μέλος πάτησε «Μπες» (ή αν υπάρχει ήδη σημείωμα)· αλλιώς το διαλέγει ο θεραπευτής.
  // Νηφαλιότητα και ανησυχία: ΧΩΡΙΣ προεπιλογή σε νέο σημείωμα (13/10)· αποθηκευμένες απαντήσεις μένουν ως έχουν.
  // Σε διόρθωση ο διακόπτης «Ενημέρωση ομάδας» ξεκινά κλειστός: η ομάδα ενημερώθηκε ήδη την πρώτη φορά.
  const [d, setD] = useState<Partial<NoteForm>>({ came: initial ? (initial.came ?? true) : cameDefault ? true : undefined, ...initial, notify: false });
  const editing = Boolean(initial);
  // Τα βήματα: από το πλαίσιο της οθόνης (NoteWorkspace, σε όλο το πλάτος) όταν υπάρχει, αλλιώς τοπικά.
  const ws = useSteps();
  const [localTab, setLocalTab] = useState<Tab>(0);
  const tab = (ws ? ws.tab : localTab) as Tab;
  const setTab = (t: Tab) => (ws ? ws.setTab(t) : setLocalTab(t));
  // «Πίσω» / «Συνέχεια» από τη μπάρα: το νέο βήμα ξεκινά από τον τίτλο του (αν έχεις κατέβει πιο κάτω, ανεβαίνει η σελίδα).
  const goStep = (t: Tab) => {
    setTab(t);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".ws-steps") ?? document.getElementById("notebook");
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState("");
  const set = <K extends keyof NoteForm>(k: K, v: NoteForm[K]) => {
    setTouched(true);
    setProblem("");
    setD((x) => ({ ...x, [k]: v }));
  };
  const toggle = (k: "presented" | "brought" | "defenses", v: string) =>
    setD((x) => {
      const cur = (x[k] as string[] | undefined) ?? [];
      setTouched(true);
      setProblem("");
      return { ...x, [k]: cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v] };
    });
  const notify = Boolean(d.notify);
  // «Δεν ήρθε»: φεύγουν μόνο τα πεδία που φαίνονται (όχι κλινικά που γράφτηκαν πριν αλλάξει σε «Δεν ήρθε»).
  const payload = d.came === false
    ? { came: false, absentText: d.absentText, sober: true, safeOk: d.safeOk, safetyText: d.safetyText, concern: d.concern, notify }
    : { ...d, notify };

  // Ο έλεγχος γίνεται εδώ πριν φύγει: αν λείπει κάτι, το σημείωμα μένει όπως είναι και ανοίγει η σωστή καρτέλα.
  const formRef = useNoteForm();
  const [submitting, setSubmitting] = useState(false);
  // Αποθήκευση που δεν πέτυχε (16/10): η σελίδα δεν φεύγει· ό,τι γράφτηκε μένει, με μήνυμα (src/lib/save-failure.ts).
  const [stale, setStale] = useState(false);
  const leaving = useRef(false);
  const run = async (fd: FormData) => {
    try {
      await action(fd);
    } catch (e) {
      unstable_rethrow(e); // η μετάβαση μετά την αποθήκευση (redirect) δεν είναι σφάλμα
      const f = saveFailure(e);
      setStale(f.stale);
      setProblem(f.text);
      setSubmitting(false);
      // Το μήνυμα να φαίνεται ολόκληρο, πάνω από τη σταθερή μπάρα αποθήκευσης.
      setTimeout(() => document.getElementById("save-problem")?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    }
  };
  // Νέα έκδοση: επαναφόρτωση χωρίς την ερώτηση «φεύγεις;» — το πρόχειρο της καρτέλας ξαναβρίσκεται μόνο του.
  const reloadKeep = () => {
    leaving.current = true;
    try { if (draftKey) sessionStorage.setItem(draftKey, JSON.stringify(d)); } catch {}
    window.location.reload();
  };
  // Όταν λείπει απάντηση: ανοίγει η σωστή καρτέλα ΚΑΙ η σελίδα πάει στην ερώτηση, που τονίζεται για λίγο
  // (14/10: η υπεύθυνη έβλεπε «Δεν αποθηκεύτηκε» χωρίς να τη «πάει» πουθενά — η ερώτηση ήταν πάνω, εκτός οθόνης).
  const [focusKey, setFocusKey] = useState("");
  useEffect(() => {
    if (!focusKey) return;
    const el = document.querySelector<HTMLElement>(`[data-q="${focusKey}"]`) ?? document.getElementById(focusKey);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("q-missing");
      el.querySelector<HTMLElement>("button, input, textarea, select")?.focus({ preventScroll: true });
      const t = setTimeout(() => el.classList.remove("q-missing"), 5000);
      setFocusKey("");
      return () => clearTimeout(t);
    }
    setFocusKey("");
  }, [focusKey, tab]);
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    let msg = "";
    let goTo: Tab | null = null;
    let key = "";
    if (d.came === undefined) { msg = "Διάλεξε «Ήρθε» ή «Δεν ήρθε»."; goTo = 0; key = "came"; }
    else if (d.came && d.sober === undefined) { msg = "Απάντησε αν έμεινε νηφάλιο από την προηγούμενη φορά."; goTo = 0; key = "sober"; }
    else if (d.safeOk === undefined) { msg = "Απάντησε αν υπάρχει ανησυχία για την ασφάλεια."; goTo = 3; key = "safeOk"; }
    else {
      const r = noteFormSchema.safeParse(payload);
      if (!r.success) {
        msg = r.error.issues[0]?.message ?? "Κάτι λείπει.";
        key = String(r.error.issues[0]?.path[0] ?? "");
        goTo = TAB_OF[key as keyof NoteForm] ?? null;
      } else if (!navigator.onLine) msg = "Δεν υπάρχει σύνδεση στο ίντερνετ· πάτα ξανά μόλις επανέλθει.";
    }
    if (msg && goTo !== null) msg += ` Είναι στο βήμα «${NOTE_TABS[goTo]}» — σε πάω εκεί.`;
    if (msg && key) setFocusKey(key);
    setProblem(msg);
    if (goTo !== null) setTab(goTo);
    if (msg) e.preventDefault();
    else setSubmitting(true);
  };

  // Πρόχειρο στη συγκεκριμένη καρτέλα του browser (σβήνει όταν κλείσει η καρτέλα): αν πέσει η σύνδεση ή λήξει
  // η είσοδος, μετά την επιστροφή το σημείωμα ξαναβρίσκεται. Σε αποτυχία αποθήκευσης το κείμενο δεν χάνεται.
  const draftKey = hidden.slotId ? `note-draft:${hidden.slotId}` : "";
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        setD(JSON.parse(raw) as Partial<NoteForm>);
        setRestored(true);
        setTouched(true);
      }
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || !touched) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(d));
    } catch {}
  }, [d, draftKey, touched]);
  // Προστασία από ακούσια έξοδο με μη αποθηκευμένες αλλαγές (όχι όταν αποθηκεύεται).
  useEffect(() => {
    if (!touched || submitting) return;
    const h = (e: BeforeUnloadEvent) => { if (leaving.current) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [touched, submitting]);

  const single = (k: "mood" | "selfHelp" | "process" | "journaling", opts: readonly string[], label: string) => (
    <div className="chips" role="group" aria-label={label}>
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={d[k] === o} onClick={() => set(k, (d[k] === o ? undefined : o) as never)}>{o}</button>
      ))}
    </div>
  );
  const multi = (k: "presented" | "brought" | "defenses", opts: readonly string[], label: string) => (
    <div className="chips" role="group" aria-label={label}>
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={((d[k] as string[] | undefined) ?? []).includes(o)} onClick={() => toggle(k, o)}>{o}</button>
      ))}
    </div>
  );
  const text = (k: keyof NoteForm, label: string, ph?: string, rows = 3) => (
    <textarea aria-label={label} placeholder={ph} rows={rows} style={{ minHeight: rows * 24 + 20, marginTop: 8 }} value={(d[k] as string | undefined) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
  );
  // Δύο κουμπιά με λέξεις (χωρίς διακόπτη, χωρίς προεπιλογή): «Ήρθε», νηφαλιότητα, ανησυχία.
  const pick2 = (label: string, opts: [string, boolean][], value: boolean | undefined, onPick: (v: boolean) => void, key?: string) => (
    <div data-q={key}>
      <div className="q-label">{label}{value === undefined && <span className="muted small"> · δεν απαντήθηκε</span>}</div>
      <span className="chips" role="group" aria-label={label}>
        {opts.map(([l, v]) => <button key={l} type="button" className="chip" aria-pressed={value === v} onClick={() => onPick(v)}>{l}</button>)}
      </span>
    </div>
  );

  // Ποιες καρτέλες έχουν κάτι γραμμένο (✓ στην καρτέλα).
  const has = (...ks: (keyof NoteForm)[]) => ks.some((k) => { const v = d[k]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false; });
  // ✓ σε βήμα μόνο όταν είναι συμπληρωμένα τα υποχρεωτικά του (16/10: όλα τα βασικά πεδία υποχρεωτικά όταν «Ήρθε»).
  const reqOk = (tabNo: Tab) => {
    const full = { presented: [], brought: [], defenses: [], presentedText: "", broughtText: "", intervention: "", response: "", positives: "", agreed: "", ...d } as Parameters<(typeof NOTE_REQUIRED)[number]["ok"]>[0];
    return NOTE_REQUIRED.filter((r) => TAB_OF[r.key as keyof NoteForm] === tabNo).every((r) => r.ok(full));
  };
  const done: boolean[] = [
    d.came !== undefined && (d.came === false ? has("absentText") : reqOk(0) && d.sober !== undefined && (d.sober || Boolean(d.newSoberSince))),
    d.came === false || reqOk(1),
    d.came === false || reqOk(2),
    d.safeOk !== undefined && (d.safeOk || Boolean(d.safetyText?.trim())),
  ];
  const absent = d.came === false;
  const doneKey = done.join(",");
  useEffect(() => { ws?.setDone(done); }, [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form ref={formRef} action={run} onSubmit={check} className="note-form" id="notebook">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {restored && <div className="notice">Βρέθηκε πρόχειρο που δεν είχε αποθηκευτεί — συνέχισε από εκεί.</div>}

      {!ws && <FormSteps steps={NOTE_TABS} active={tab} done={done} onChange={(i) => setTab(i as Tab)} label="Βήματα σημειώματος" idPrefix="note-tab" />}
      <div className="step-head" data-tour="notebook"><h2>{NOTE_TABS[tab]}</h2><p className="hint">{STEP_HINT[tab]}</p></div>

      {tab === 0 && (
        <div id="note-tab-0" role="tabpanel">
          <fieldset>{pick2("Ήρθε στην ατομική;", [["Ήρθε", true], ["Δεν ήρθε", false]], d.came, (v) => set("came", v as never), "came")}{absent && <p className="muted small" style={{ margin: "6px 0 0" }}>Δεν μετράει ως παρουσία. Γράψε μόνο ό,τι χρειάζεται (π.χ. αν ενημέρωσε, τι κάνουμε).</p>}</fieldset>
          {absent ? (
            <fieldset><legend>Τι έγινε / τι κάνουμε</legend>{text("absentText", "Τι έγινε / τι κάνουμε", "π.χ. ενημέρωσε το πρωί ότι δεν μπορεί· θα κλείσει νέα ώρα", 2)}</fieldset>
          ) : (
            <>
              <fieldset data-q="presented"><legend>Πώς παρουσιάστηκε<span className="req"> · υποχρεωτικό</span></legend>{multi("presented", PRESENTED, "Πώς παρουσιάστηκε")}{text("presentedText", "Πώς παρουσιάστηκε, με λόγια", "π.χ. έντονη, συνεχής ροή λόγου", 1)}</fieldset>
              <fieldset data-q="mood"><legend>Διάθεση<span className="req"> · υποχρεωτικό</span></legend>{single("mood", MOOD, "Διάθεση")}</fieldset>
              <fieldset data-q="selfHelp"><legend>Πόσο βοηθά τον εαυτό του <span className="muted small">(φροντίδα εαυτού)</span><span className="req"> · υποχρεωτικό</span></legend>{single("selfHelp", SELF_HELP, "Πόσο βοηθά τον εαυτό του")}</fieldset>
              <fieldset><legend>Πώς νιώθει στη διαδικασία</legend>{single("process", PROCESS, "Πώς νιώθει στη διαδικασία")}</fieldset>
              <fieldset>
                {pick2("Νηφαλιότητα από την προηγούμενη φορά;", [["Ναι", true], ["Όχι", false]], d.sober, (v) => set("sober", v as never), "sober")}
                {d.sober === false && (
                  <label style={{ marginTop: 8 }}>Νέα ημερομηνία νηφαλιότητας
                    <input type="date" value={d.newSoberSince ?? ""} onChange={(e) => set("newSoberSince", e.target.value as never)} required />
                  </label>
                )}
              </fieldset>
              <fieldset data-q="journaling"><legend>Γράφει απογραφές; <span className="muted small">(ημερολόγιο ανάκαμψης)</span><span className="req"> · υποχρεωτικό</span></legend>{single("journaling", JOURNALING, "Γράφει απογραφές")}</fieldset>
            </>
          )}
        </div>
      )}

      {tab === 1 && (
        <div id="note-tab-1" role="tabpanel">
          {absent ? <p className="muted">«Δεν ήρθε»: το βήμα αυτό δεν συμπληρώνεται.</p> : (
            <>
              <fieldset data-q="brought"><legend>Τι έφερε<span className="req"> · υποχρεωτικό</span></legend>{multi("brought", [...themeForms, ...THEMES], "Τι έφερε")}<p className="hint" style={{ margin: "6px 0 0" }}>Οι επιλογές είναι θέματα της δουλειάς, όχι διαγνωστικές κατηγορίες.</p><ThemeDetails items={themeDetails} intro="Η θεματική της εβδομάδας, για να τη δεις εδώ:" />{text("broughtText", "Τι έφερε, με λόγια", "Με δικά σου λόγια")}</fieldset>
              <fieldset data-q="intervention"><legend>Σε τι επικεντρώθηκε η παρέμβαση<span className="req"> · υποχρεωτικό</span></legend>{text("intervention", "Σε τι επικεντρώθηκε η παρέμβαση", "π.χ. να μείνει στο συναίσθημά του")}</fieldset>
              <fieldset data-q="response"><legend>Ανταπόκριση και άμυνες<span className="req"> · υποχρεωτικό</span></legend>{multi("defenses", DEFENSES, "Άμυνες")}{text("response", "Ανταπόκριση με λόγια", "π.χ. άκουσε, αλλά δεν πήρε την ανατροφοδότηση", 1)}</fieldset>
              <fieldset data-q="positives"><legend>Τα θετικά<span className="req"> · υποχρεωτικό</span></legend>{text("positives", "Τα θετικά", "π.χ. επέλεξε να φύγει νωρίς", 1)}</fieldset>
              <fieldset><legend>Πώς ήταν να είμαι μαζί του σήμερα <span className="muted small">προαιρετικός αναστοχασμός</span></legend>{text("felt", "Πώς ήταν να είμαι μαζί του σήμερα", "Ως παρατήρηση για τη σχέση", 2)}</fieldset>
            </>
          )}
        </div>
      )}

      {tab === 2 && (
        <div id="note-tab-2" role="tabpanel">
          {absent ? <p className="muted">«Δεν ήρθε»: γράψε τι κάνουμε στην «Εικόνα σήμερα».</p> : (
            <>
              <fieldset><legend>Τι προτείναμε</legend>{text("suggested", "Τι προτείναμε", "Φαίνεται στην επόμενη ατομική", 1)}</fieldset>
              <fieldset data-q="agreed"><legend>Τι συμφωνήθηκε ως επόμενο βήμα <span className="muted small">με το μέλος</span><span className="req"> · υποχρεωτικό</span></legend>{text("agreed", "Τι συμφωνήθηκε ως επόμενο βήμα", "π.χ. να έρθει στην πρωινή ομάδα της Τρίτης", 1)}</fieldset>
              <fieldset><legend>Τι έμεινε ανοιχτό</legend>{text("openIssues", "Τι έμεινε ανοιχτό", "π.χ. δεν προλάβαμε το θέμα με την αδερφή", 1)}</fieldset>
              <fieldset><legend>Τι χρειάζεται να ξέρει ο επόμενος θεραπευτής</legend>{text("handover", "Τι χρειάζεται να ξέρει ο επόμενος θεραπευτής", "Φαίνεται στο «Ανοιχτό από την προηγούμενη φορά» της επόμενης ατομικής", 2)}</fieldset>
              {(context?.goal || context?.assignment) && (
                <fieldset>
                  <legend>Σχετική εργασία ή στόχος <span className="muted small">όπως είναι τώρα</span></legend>
                  {context.goal && <div>Στόχος εβδομάδας: «{context.goal}»</div>}
                  {context.assignment && <div>Εργασία: {context.assignment}</div>}
                </fieldset>
              )}
            </>
          )}
        </div>
      )}

      {tab === 3 && (
        <div id="note-tab-3" role="tabpanel">
          <fieldset id="safeOk-group">
            {pick2("Υπάρχει ανησυχία για την ασφάλεια;", [["Όχι", true], ["Ναι", false]], d.safeOk, (v) => set("safeOk", v as never), "safeOk")}
            {d.safeOk === false && (
              <div className="must">
                <label htmlFor="safetyText">Τι ανησυχεί και ποιος ενημερώθηκε <span>· υποχρεωτικό</span></label>
                <textarea id="safetyText" rows={2} style={{ minHeight: 68 }} placeholder="π.χ. σκέψεις χωρίς σχέδιο· ενημέρωσα τηλεφωνικά τη Χ. (ψυχολόγο) 10:50" value={d.safetyText ?? ""} onChange={(e) => set("safetyText", e.target.value as never)} />
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Προβληματισμός προς τη θεραπευτική ομάδα</legend>
            {text("concern", "Προβληματισμός προς τη θεραπευτική ομάδα", "Αν γράψεις εδώ, ενημερώνεται η ομάδα")}
          </fieldset>
          <fieldset>
            <div className="row spread" style={{ flexWrap: "nowrap" }}>
              <span>Ενημέρωση ομάδας θεραπευτών τώρα</span>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <span className="small muted" aria-hidden>{notify ? "Ναι" : "Όχι"}</span>
                <button type="button" role="switch" aria-checked={notify} aria-label="Ενημέρωση ομάδας θεραπευτών τώρα" className="switch" onClick={() => set("notify", !notify as never)} />
              </span>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              <strong>Ποιος ενημερώνεται και τι γίνεται μετά:</strong> βγαίνει μία κίτρινη γραμμή για 24 ώρες στο «Σήμερα» όλων των θεραπευτών και της διαχείρισης (το ίδιο γίνεται μόνο του με «Ανησυχία: Ναι» ή με προβληματισμό).
              Δεν στέλνεται ειδοποίηση στο κινητό κανενός και τίποτα στο μέλος. Αν χρειάζεται τηλεφώνημα ή άμεση ενέργεια, τη ζητάς εσύ από τη διαχείριση ή την κάνεις τώρα.
              {editing && " Σε διόρθωση, η ομάδα ενημερώνεται ξανά μόνο αν γράψεις κάτι καινούργιο."}
            </div>
          </fieldset>
        </div>
      )}

      {problem && (
        <div id="save-problem" className="error" role="alert" style={{ marginTop: 10 }}>
          Δεν αποθηκεύτηκε: {problem} Ό,τι έγραψες είναι εδώ.
          {stale && <> <button type="button" className="btn sm" style={{ marginLeft: 6 }} onClick={reloadKeep}>Ξαναφόρτωσε</button></>}
        </div>
      )}
      <p className="muted small form-foot">Όλα τα βήματα αποθηκεύονται μαζί, με όνομα και ώρα. Κάθε αλλαγή κρατά την προηγούμενη μορφή. Ctrl + Enter = Αποθήκευση.</p>
      <SaveBar
        early={false}
        dirty={touched}
        problem={problem}
        savedAt={savedAt}
        nav={{ back: tab > 0 ? () => goStep((tab - 1) as Tab) : undefined, next: tab < 3 ? () => goStep((tab + 1) as Tab) : undefined, nextLabel: tab < 3 ? (NOTE_TABS[tab + 1] === "Συνέχεια" ? "Συνέχεια" : `Συνέχεια: ${NOTE_TABS[tab + 1]}`) : undefined, last: tab === 3 }}
      />

    </form>
  );
}
