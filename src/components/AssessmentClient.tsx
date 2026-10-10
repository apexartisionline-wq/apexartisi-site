"use client";

import { type ReactNode, useState } from "react";
import {
  ABSTINENCE, AS_PRESCRIBED, type Assessment, assessmentWarnings, AUDIT_ITEMS, auditScore, DAST_ITEMS, dastScore, DIAGNOSES, PGSI_ITEMS,
  PGSI_OPTIONS, pgsiScore, questionnaires, type Score, SUBSTANCE_LABEL, SUBSTANCES, type SubstanceKey, TRAUMA, TREATMENT_END,
  TREATMENT_WHERE, type YesNo,
} from "@/lib/assessment";

type ProfileView = { rows: [string, string][]; at: string } | null;
type Props = {
  action: (formData: FormData) => void;
  memberId: string;
  initial: Assessment;
  profile: ProfileView;
  showAdminFields: boolean;
  complete: boolean;
};

// Προτεινόμενες διατυπώσεις για τις δύσκολες ερωτήσεις (από τη δοκιμή με τη ματιά του μέλους).
const SAY = {
  audit: "«Οι ερωτήσεις αυτές είναι για την περίοδο που έπινες, στη χειρότερη φάση. Δεν αμφισβητούμε τη νηφαλιότητά σου.»",
  forms: "«Είναι σύντομα, τα ίδια για όλους. Δεν σε κρίνουν· μας δείχνουν από πού ξεκινάμε.»",
  debt: "«Υπάρχει αυτή τη στιγμή κάποιος που σε πιέζει ή σε απειλεί για χρήματα;»",
  diagnoses: "«Μας ενδιαφέρει τι σου έχουν πει, όχι να σου βάλουμε εμείς διάγνωση.»",
  pregnant: "«Ρωτάμε όλες τις γυναίκες, γιατί κάποια φάρμακα και η απότομη διακοπή τους θέλουν προσοχή.»",
  children: "«Ρωτάμε για να ξέρουμε πώς να σε στηρίξουμε και ως γονιό.»",
  violence: "«Ρωτάμε όλους, για την ασφάλεια όλων. Υπάρχει σήμερα στο σπίτι σου κάποιος που σε φοβίζει, ή στιγμές που φοβάσαι ότι θα χάσεις τον έλεγχο;»",
};

// Η αρχική αξιολόγηση για τον ψυχολόγο: ενότητες που ανοίγουν με τη σειρά που γίνεται η κουβέντα
// (πρώτα «Γιατί τώρα»), Ναι / Όχι / «Δεν απαντά ακόμα» με ένα πάτημα, ερωτηματολόγια που ανοίγουν μόνο
// όταν χρειάζονται και αθροίζονται μόνα τους. Όλα στέλνονται ως JSON (payload)· ο server τα ελέγχει.
export function AssessmentClient({ action, memberId, initial, profile, showAdminFields, complete }: Props) {
  const [d, setD] = useState<Assessment>(initial);
  // Οι ενότητες ανοίγουν/κλείνουν μόνο από τον χρήστη (το αρχικό «ανοιχτό» βγαίνει από τα αποθηκευμένα, όχι από ό,τι γράφεται τώρα).
  const set = <K extends keyof Assessment>(k: K, v: Assessment[K]) => setD((x) => ({ ...x, [k]: v }));
  const q = questionnaires(d);
  const warnings = assessmentWarnings(d);

  const say = (t: string) => <div className="muted small" style={{ marginTop: 6 }}>💬 {t}</div>;
  const ynButtons = (k: keyof Assessment, label: string) => {
    const v = d[k] as YesNo;
    const pickV = (x: YesNo) => set(k, (v === x ? undefined : x) as never);
    return (
      <span className="yn" role="group" aria-label={label}>
        <button type="button" aria-pressed={v === true} onClick={() => pickV(true)}>Ναι</button>
        <button type="button" aria-pressed={v === false} onClick={() => pickV(false)}>Όχι</button>
        <button type="button" aria-pressed={v === "DECLINED"} onClick={() => pickV("DECLINED")} title="Δεν θέλει να απαντήσει ακόμα">Δεν απάντησε ακόμα</button>
      </span>
    );
  };
  const yn = (k: keyof Assessment, label: string, opts: { sub?: ReactNode; hint?: string } = {}) => (
    <div className="q">
      <div className="lab">{label}</div>
      {ynButtons(k, label)}
      {opts.hint && say(opts.hint)}
      {d[k] === true && opts.sub && <div className="sub-q">{opts.sub}</div>}
    </div>
  );
  const txt = (k: keyof Assessment, label: string, ph = "", rows = 2) => (
    <div className="q">
      <div className="lab">{label}</div>
      <textarea aria-label={label} placeholder={ph} rows={rows} style={{ minHeight: rows * 24 + 20 }} value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );
  const line = (k: keyof Assessment, label: string, ph = "") => (
    <div className="q">
      <div className="lab">{label}</div>
      <input aria-label={label} placeholder={ph} value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );
  const field = (label: string, input: ReactNode) => <label style={{ display: "block", marginTop: 8 }}><span className="small muted">{label}</span>{input}</label>;
  const chipsOne = <T extends string>(opts: readonly T[], value: T | undefined, onPick: (v: T | undefined) => void) => (
    <div className="chips">
      {opts.map((o) => <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onPick(value === o ? undefined : o)}>{o}</button>)}
    </div>
  );
  const scoreRow = (name: string, s: Score | null) => (
    <div className="score">
      <span>{name}{s && s.answered < s.of && <span className="muted small"> · {s.answered} από {s.of}</span>}</span>
      {s ? (
        <span><b>{s.score}</b> <span className={`badge ${s.level === "red" ? "red" : s.level === "amber" ? "amber" : s.level === "ok" ? "ok" : ""}`}>{s.band}</span></span>
      ) : <span className="muted small">δεν έχει απαντηθεί</span>}
    </div>
  );
  const setArr = (k: "audit" | "pgsi" | "dast", i: number, v: number | boolean | null, len: number) =>
    setD((x) => {
      const a = [...(x[k] as (number | boolean | null)[])];
      while (a.length < len) a.push(null);
      a[i] = v;
      return { ...x, [k]: a };
    });
  const toggleSub = (s: SubstanceKey) =>
    set("substances", d.substances.includes(s) ? d.substances.filter((x) => x !== s) : [...d.substances, s]);
  const setPer = (s: SubstanceKey, patch: { problemAge?: number; lastUse?: string }) =>
    set("perSubstance", { ...d.perSubstance, [s]: { ...d.perSubstance[s], ...patch } });

  const answered = (v: YesNo) => v !== undefined;
  const done = {
    why: Boolean(d.whyNow || d.workOn),
    use: d.substances.length > 0,
    treat: d.treatments.length > 0,
    psych: answered(d.psychoticNow),
    health: answered(d.pregnant) || Boolean(d.healthNote),
    legal: answered(d.courtObligation) && answered(d.prisonRecent),
    family: answered(d.children) && answered(d.violence),
    strengths: Boolean(d.strengths || d.fears),
    summary: Boolean(d.summary),
  };
  const mark = (ok: boolean) => ok && <span className="done">✓</span>;

  return (
    <form action={action}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      <div className="card small" style={{ background: "var(--soft)" }}>
        <strong>Πες στην αρχή</strong>
        <p style={{ margin: "6px 0 0" }}>
          «Θα σου κάνω κάποιες ερωτήσεις, κάποιες προσωπικές. Ό,τι πεις το διαβάζει μόνο η θεραπευτική μας ομάδα· τηλέφωνα, διεύθυνση και νομικά
          τα βλέπει μόνο η διαχείριση. Τίποτα δεν πάει έξω από εδώ — με μόνη εξαίρεση αν κινδυνεύει σοβαρά η ζωή σου, κάποιου άλλου ή ένα παιδί.
          Σε όποια ερώτηση θέλεις, μπορείς να πεις “δεν θέλω να απαντήσω ακόμα”.»
        </p>
      </div>

      {profile && (
        <details className="sec" open={!initial.profileConfirmed}>
          <summary>Στοιχεία από το μέλος {mark(d.profileConfirmed)}</summary>
          {profile.rows.length === 0 ? (
            <div className="q muted">Το μέλος δεν τα έχει συμπληρώσει ακόμα. Ρώτα τα στην αρχή και πες στη διαχείριση.</div>
          ) : (
            profile.rows.map(([k, v]) => <div key={k} className="q inline"><span className="muted">{k}</span><span style={{ textAlign: "right" }}>{v}</span></div>)
          )}
          <div className="q inline">
            <span>Τα επιβεβαίωσα με το μέλος</span>
            <button type="button" role="switch" aria-checked={d.profileConfirmed} aria-label="Τα επιβεβαίωσα" className="switch" onClick={() => set("profileConfirmed", !d.profileConfirmed)} />
          </div>
          <div className="q muted small">Μετά την ολοκλήρωση τα βλέπει μόνο η διαχείριση.</div>
        </details>
      )}

      <details className="sec" open={!(initial.whyNow || initial.workOn)}>
        <summary>Γιατί τώρα {mark(done.why)}</summary>
        {txt("whyNow", "«Γιατί τώρα;» (με τα λόγια του)")}
        {txt("workOn", "Τι θέλει να δουλέψει στον εαυτό του")}
        <div className="q">
          <div className="lab">Αποχή</div>
          {chipsOne(ABSTINENCE, d.abstinence, (v) => set("abstinence", v))}
        </div>
        {line("longestAbstinence", "Μεγαλύτερη περίοδος αποχής", "π.χ. 2 χρόνια")}
        {txt("longestHelped", "Τι τη βοήθησε")}
        {txt("longestEnded", "Τι την έληξε")}
      </details>

      <details className="sec">
        <summary>Ιστορικό χρήσης {mark(done.use)}</summary>
        <div className="q">
          <div className="lab">Τσέκαρε ό,τι έχει χρησιμοποιήσει</div>
          <div className="chips">
            {SUBSTANCES.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={d.substances.includes(k)} onClick={() => toggleSub(k)}>{label}</button>)}
          </div>
          {d.substances.includes("other") && field("Άλλο: ποιο", <input aria-label="Άλλο: ποιο" value={d.otherName} onChange={(e) => set("otherName", e.target.value)} />)}
        </div>
        {SUBSTANCES.filter(([k]) => d.substances.includes(k)).map(([k]) => (
          <div key={k} className="q">
            <div className="lab"><strong>{k === "other" && d.otherName ? d.otherName : SUBSTANCE_LABEL[k]}</strong></div>
            <div className="grid2">
              {field("Ηλικία που έγινε πρόβλημα", <input type="number" inputMode="numeric" min={5} max={99} value={d.perSubstance[k]?.problemAge ?? ""} onChange={(e) => setPer(k, { problemAge: e.target.value ? Number(e.target.value) : undefined })} />)}
              {field(k === "gambling" ? "Τελευταίο παιχνίδι" : "Τελευταία φορά", <input type="date" value={d.perSubstance[k]?.lastUse ?? ""} onChange={(e) => setPer(k, { lastUse: e.target.value || undefined })} />)}
            </div>
          </div>
        ))}
        <div className="q muted small">{SAY.forms}</div>
        <details className="sec" style={{ margin: "0 16px 12px" }}>
          <summary>AUDIT · αλκοόλ, στην περίοδο βαριάς χρήσης</summary>
          <div className="q">
            {say(SAY.audit)}
            {AUDIT_ITEMS.map((it, i) => (
              <div key={i} className="qitem">
                <div className="small" style={{ marginBottom: 6 }}>{i + 1}. {it.q}</div>
                <div className="chips">
                  {it.options.map(([v, l]) => <button key={l} type="button" className="chip" aria-pressed={d.audit[i] === v} onClick={() => setArr("audit", i, d.audit[i] === v ? null : v, 10)}>{l}</button>)}
                </div>
              </div>
            ))}
          </div>
        </details>
        {scoreRow("AUDIT", auditScore(d.audit))}
        {q.dast && (
          <>
            <details className="sec" style={{ margin: "12px 16px" }}>
              <summary>DAST-10 · ουσίες, στην περίοδο βαριάς χρήσης</summary>
              <div className="q">
                {DAST_ITEMS.map((t, i) => (
                  <div key={i} className="qitem row spread" style={{ flexWrap: "nowrap" }}>
                    <span className="small">{t}</span>
                    <span className="yn">
                      <button type="button" aria-pressed={d.dast[i] === true} onClick={() => setArr("dast", i, d.dast[i] === true ? null : true, 10)}>Ναι</button>
                      <button type="button" aria-pressed={d.dast[i] === false} onClick={() => setArr("dast", i, d.dast[i] === false ? null : false, 10)}>Όχι</button>
                    </span>
                  </div>
                ))}
              </div>
            </details>
            {scoreRow("DAST-10", dastScore(d.dast))}
          </>
        )}
        {q.pgsi && (
          <>
            <details className="sec" style={{ margin: "12px 16px" }}>
              <summary>PGSI · τζόγος, στην περίοδο βαριάς χρήσης</summary>
              <div className="q">
                {say("«Οι ερωτήσεις αυτές είναι για την περίοδο που έπαιζες, στη χειρότερη φάση.»")}
                {PGSI_ITEMS.map((t, i) => (
                  <div key={i} className="qitem">
                    <div className="small" style={{ marginBottom: 6 }}>{t}</div>
                    <div className="chips">
                      {PGSI_OPTIONS.map(([v, l]) => <button key={l} type="button" className="chip" aria-pressed={d.pgsi[i] === v} onClick={() => setArr("pgsi", i, d.pgsi[i] === v ? null : v, 9)}>{l}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            </details>
            {scoreRow("PGSI", pgsiScore(d.pgsi))}
          </>
        )}
        <div className="q muted small">Δοκιμή: τα κείμενα των ερωτηματολογίων είναι προσωρινά, μέχρι τις άδειες.</div>
        {yn("overdoseEver", "Υπερδοσολογία, έστω μία φορά", {
          sub: field("Πότε η τελευταία (έστω περίπου)", <input type="date" value={d.overdoseLast ?? ""} onChange={(e) => set("overdoseLast", e.target.value || undefined)} />),
        })}
        {yn("seizuresEver", "Στερητικά με σπασμούς, έστω μία φορά")}
        {yn("ost", "Μεθαδόνη / βουπρενορφίνη τώρα")}
        {q.pgsi && yn("debtThreats", "Τζόγος: χρέη με απειλές τώρα", { hint: SAY.debt })}
        {warnings.map((w) => <div key={w} className="q error small">{w}</div>)}
      </details>

      <details className="sec">
        <summary>Προηγούμενες θεραπείες {mark(done.treat)}</summary>
        {d.treatments.map((t, i) => {
          const upd = (patch: Partial<typeof t>) => set("treatments", d.treatments.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="q">
              <div className="row spread"><strong>Θεραπεία {i + 1}</strong><button type="button" className="small" onClick={() => set("treatments", d.treatments.filter((_, j) => j !== i))}>Αφαίρεση</button></div>
              {chipsOne(TREATMENT_WHERE, t.where, (v) => upd({ where: v ?? TREATMENT_WHERE[0] }))}
              {field("Πού (π.χ. όνομα μονάδας)", <input value={t.whereText} onChange={(e) => upd({ whereText: e.target.value })} />)}
              <div className="grid2">
                {field("Πότε", <input placeholder="π.χ. 2021" value={t.when} onChange={(e) => upd({ when: e.target.value })} />)}
                {field("Πόσο κράτησε", <input placeholder="π.χ. 6 μήνες" value={t.duration} onChange={(e) => upd({ duration: e.target.value })} />)}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>Πώς τελείωσε</div>
              {chipsOne(TREATMENT_END, t.ended, (v) => upd({ ended: v }))}
              {field("Τι βοήθησε, τι όχι", <textarea style={{ minHeight: 60 }} value={t.helped} onChange={(e) => upd({ helped: e.target.value })} />)}
            </div>
          );
        })}
        <div className="q"><button type="button" onClick={() => set("treatments", [...d.treatments, { where: TREATMENT_WHERE[0], whereText: "", when: "", duration: "", helped: "" }])}>+ Προσθήκη θεραπείας</button></div>
      </details>

      <details className="sec">
        <summary>Ψυχιατρικό και φάρμακα {mark(done.psych)}</summary>
        <div className="q">
          <div className="lab">Διαγνώσεις που του έχουν πει</div>
          <div className="chips">
            {DIAGNOSES.map((o) => <button key={o} type="button" className="chip" aria-pressed={d.diagnoses.includes(o)} onClick={() => set("diagnoses", d.diagnoses.includes(o) ? d.diagnoses.filter((x) => x !== o) : [...d.diagnoses, o])}>{o}</button>)}
          </div>
          {field("Άλλο, με λόγια", <input value={d.diagnosesText} onChange={(e) => set("diagnosesText", e.target.value)} />)}
          {say(SAY.diagnoses)}
        </div>
        {yn("psychoticNow", "Ψυχωσικά συμπτώματα τώρα", { sub: <span className="small" style={{ color: "var(--red)" }}>Φαίνεται στο «Ασφάλεια» του φακέλου και στο «Σήμερα» της ομάδας.</span> })}
        {yn("attemptEver", "Απόπειρα / αυτοτραυματισμός, έστω μία φορά", { sub: <span className="small">Κάνε και την αξιολόγηση αναγκών ασφάλειας (03).</span> })}
        {yn("hospitalisedEver", "Νοσηλεία σε ψυχιατρική κλινική, έστω μία φορά")}
        <div className="q">
          <div className="lab">Τραύμα <span className="muted small">(χωρίς λεπτομέρειες)</span></div>
          {chipsOne(TRAUMA, d.trauma, (v) => set("trauma", v))}
        </div>
        {d.meds.map((m, i) => {
          const upd = (patch: Partial<typeof m>) => set("meds", d.meds.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="q">
              <div className="row spread"><strong>Φάρμακο {i + 1}</strong><button type="button" className="small" onClick={() => set("meds", d.meds.filter((_, j) => j !== i))}>Αφαίρεση</button></div>
              <div className="grid2">
                {field("Φάρμακο", <input value={m.name} onChange={(e) => upd({ name: e.target.value })} />)}
                {field("Δόση", <input value={m.dose} onChange={(e) => upd({ dose: e.target.value })} />)}
              </div>
              {field("Για ποιο λόγο", <input value={m.why} onChange={(e) => upd({ why: e.target.value })} />)}
              <div className="small muted" style={{ marginTop: 8 }}>Το παίρνει όπως το έγραψε ο γιατρός</div>
              {chipsOne(AS_PRESCRIBED, m.asPrescribed, (v) => upd({ asPrescribed: v }))}
            </div>
          );
        })}
        <div className="q"><button type="button" onClick={() => set("meds", [...d.meds, { name: "", dose: "", why: "" }])}>+ Προσθήκη φαρμάκου</button></div>
        {line("psychiatristName", "Ψυχίατρος που τα γράφει (όνομα)")}
        {showAdminFields && line("psychiatristPhone", "Τηλέφωνο ψυχιάτρου · το βλέπει μόνο η διαχείριση")}
      </details>

      <details className="sec">
        <summary>Υγεία {mark(done.health)}</summary>
        {yn("pregnant", "Εγκυμοσύνη τώρα / πιθανή", { hint: SAY.pregnant, sub: <span className="small" style={{ color: "var(--red)" }}>Φαίνεται στο «Ασφάλεια» του φακέλου και στο «Σήμερα»· παραπομπή σε γιατρό.</span> })}
        {txt("healthNote", "Κάτι για την υγεία του που πρέπει να ξέρουμε;")}
      </details>

      <details className="sec">
        <summary>Νομικά {mark(done.legal)}</summary>
        {yn("courtObligation", "Υποχρέωση θεραπείας / βεβαίωσης από δικαστήριο")}
        {yn("prisonRecent", "Βγήκε από φυλακή τους τελευταίους 3 μήνες", { sub: <span className="small">Αυξημένος κίνδυνος υπερδοσολογίας.</span> })}
        {showAdminFields && (d.courtObligation === true || d.legalDetail) && txt("legalDetail", "Λεπτομέρειες (τι βεβαιώνουμε και σε ποιον) · τις βλέπει μόνο η διαχείριση")}
      </details>

      <details className="sec">
        <summary>Οικογένεια {mark(done.family)}</summary>
        {yn("children", "Παιδιά κάτω των 18", {
          hint: SAY.children,
          sub: (
            <>
              <div className="lab">Ανησυχία για την ασφάλειά τους</div>
              {ynButtons("childConcern", "Ανησυχία για παιδί")}
            </>
          ),
        })}
        {d.children === true && d.childConcern === true && txt("childConcernText", "Τι ανησυχεί · φαίνεται στο «Ασφάλεια» και στο «Σήμερα»")}
        {yn("violence", "Βία στο σπίτι (δέχεται ή ασκεί)", { hint: SAY.violence })}
        {d.violence === true && txt("violenceText", "Με λίγα λόγια · φαίνεται στο «Ασφάλεια» και στο «Σήμερα»")}
      </details>

      <details className="sec">
        <summary>Δυνάμεις και φόβοι {mark(done.strengths)}</summary>
        {txt("strengths", "Δυνάμεις")}
        {txt("fears", "Τι φοβάται από τη συνεργασία μαζί μας")}
      </details>

      <details className="sec" open={!initial.summary}>
        <summary>Σύνοψη για την ομάδα {mark(done.summary)}</summary>
        {txt("summary", "5–8 γραμμές: τι φέρνει το μέλος εδώ · τι συντηρεί τον εθισμό · τι προστατεύει · τι χρειάζεται πρώτα", "Το πρώτο που θα διαβάσει κάθε θεραπευτής στον φάκελο", 6)}
      </details>

      <div className="sticky-save">
        <button type="submit" name="complete" value="0">Αποθήκευση</button>
        {!complete && <button type="submit" name="complete" value="1" className="primary">Ολοκλήρωση</button>}
      </div>
      <p className="muted small" style={{ paddingBottom: 70 }}>Κάθε αποθήκευση κρατιέται με όνομα και ώρα· οι παλιές μορφές δεν σβήνονται.</p>
    </form>
  );
}
