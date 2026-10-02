"use client";

import { type ReactNode, useState } from "react";
import {
  ABSTINENCE, AS_PRESCRIBED, type Assessment, AUDIT_ITEMS, auditScore, DAST_ITEMS, dastScore, DIAGNOSES, PGSI_ITEMS, PGSI_OPTIONS,
  pgsiScore, questionnaires, type Score, SUBSTANCE_LABEL, SUBSTANCES, type SubstanceKey, TRAUMA, TREATMENT_END, TREATMENT_WHERE,
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

// Η αρχική αξιολόγηση για τον ψυχολόγο: ενότητες που ανοίγουν με τη σειρά, Ναι/Όχι με ένα πάτημα,
// ερωτηματολόγια που ανοίγουν μόνο όταν χρειάζονται και αθροίζονται μόνα τους.
// Όλα στέλνονται ως JSON (payload)· ο server τα ελέγχει (src/lib/assessment.ts).
export function AssessmentClient({ action, memberId, initial, profile, showAdminFields, complete }: Props) {
  const [d, setD] = useState<Assessment>(initial);
  const set = <K extends keyof Assessment>(k: K, v: Assessment[K]) => setD((x) => ({ ...x, [k]: v }));
  const q = questionnaires(d);

  const yn = (k: keyof Assessment, label: string, sub?: ReactNode) => {
    const v = d[k] as boolean | undefined;
    return (
      <div className="q">
        <div className="row spread" style={{ flexWrap: "nowrap", gap: 10 }}>
          <span>{label}</span>
          <span className="yn" role="group" aria-label={label}>
            <button type="button" aria-pressed={v === true} onClick={() => set(k, (v === true ? undefined : true) as never)}>Ναι</button>
            <button type="button" aria-pressed={v === false} onClick={() => set(k, (v === false ? undefined : false) as never)}>Όχι</button>
          </span>
        </div>
        {v === true && sub && <div className="sub-q">{sub}</div>}
      </div>
    );
  };
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
  const chipsOne = <T extends string>(opts: readonly T[], value: T | undefined, onPick: (v: T | undefined) => void) => (
    <div className="chips">
      {opts.map((o) => <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onPick(value === o ? undefined : o)}>{o}</button>)}
    </div>
  );
  const scoreRow = (name: string, s: Score | null) => (
    <div className="score">
      <span>{name}{s && s.answered < s.of && <span className="muted small"> · {s.answered} από {s.of}</span>}</span>
      {s ? <span><b>{s.score}</b> <span className={`badge ${s.level === "red" ? "red" : s.level === "amber" ? "amber" : "ok"}`}>{s.band}</span></span> : <span className="muted small">δεν έχει απαντηθεί</span>}
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

  const auditS = auditScore(d.audit);
  const dastS = dastScore(d.dast);
  const pgsiS = pgsiScore(d.pgsi);
  const done = {
    use: d.substances.length > 0,
    treat: d.treatments.length > 0 || Boolean(d.longestAbstinence),
    psych: d.psychoticNow !== undefined,
    health: d.pregnant !== undefined || Boolean(d.healthNote),
    legal: d.courtObligation !== undefined && d.prisonRecent !== undefined,
    family: d.children !== undefined && d.violence !== undefined,
    motive: Boolean(d.whyNow || d.workOn),
    summary: Boolean(d.summary),
  };
  const mark = (ok: boolean) => ok && <span className="done">✓</span>;

  return (
    <form action={action}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      {profile && (
        <details className="sec" open={!d.profileConfirmed}>
          <summary>Στοιχεία από το μέλος {mark(d.profileConfirmed)}</summary>
          {profile.rows.length === 0 ? (
            <div className="q muted">Το μέλος δεν τα έχει συμπληρώσει ακόμα. Ρώτα τα στην αρχή και πες στη διαχείριση.</div>
          ) : (
            profile.rows.map(([k, v]) => <div key={k} className="q inline"><span className="muted">{k}</span><span style={{ textAlign: "right" }}>{v}</span></div>)
          )}
          <div className="q inline">
            <span>Τα επιβεβαίωσα μαζί του/της</span>
            <button type="button" role="switch" aria-checked={d.profileConfirmed} aria-label="Τα επιβεβαίωσα" className="switch" onClick={() => set("profileConfirmed", !d.profileConfirmed)} />
          </div>
          <div className="q muted small">Μετά την ολοκλήρωση τα βλέπει μόνο η διαχείριση.</div>
        </details>
      )}

      <details className="sec">
        <summary>Ιστορικό χρήσης {mark(done.use)}</summary>
        <div className="q">
          <div className="lab">Τσέκαρε ό,τι έχει χρησιμοποιήσει</div>
          <div className="chips">
            {SUBSTANCES.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={d.substances.includes(k)} onClick={() => toggleSub(k)}>{label}</button>)}
          </div>
          {d.substances.includes("other") && <input style={{ marginTop: 8 }} aria-label="Άλλο: ποιο" placeholder="Άλλο: ποιο" value={d.otherName} onChange={(e) => set("otherName", e.target.value)} />}
        </div>
        {SUBSTANCES.filter(([k]) => d.substances.includes(k)).map(([k]) => (
          <div key={k} className="q">
            <div className="lab"><strong>{k === "other" && d.otherName ? d.otherName : SUBSTANCE_LABEL[k]}</strong></div>
            <div className="grid2">
              <label>Έγινε πρόβλημα στα (ηλικία)
                <input type="number" inputMode="numeric" min={5} max={99} value={d.perSubstance[k]?.problemAge ?? ""} onChange={(e) => setPer(k, { problemAge: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
              <label>Τελευταία φορά
                <input type="date" value={d.perSubstance[k]?.lastUse ?? ""} onChange={(e) => setPer(k, { lastUse: e.target.value || undefined })} />
              </label>
            </div>
          </div>
        ))}
        {yn("overdoseEver", "Υπερδοσολογία ποτέ", (
          <label>Πότε η τελευταία
            <input type="date" value={d.overdoseLast ?? ""} onChange={(e) => set("overdoseLast", e.target.value || undefined)} />
          </label>
        ))}
        {yn("seizuresEver", "Στερητικά με σπασμούς ποτέ")}
        {yn("ost", "Μεθαδόνη / βουπρενορφίνη τώρα")}
        {q.pgsi && yn("debtThreats", "Τζόγος: χρέη με απειλές")}

        <details className="sec" style={{ margin: "0 16px 12px" }}>
          <summary>AUDIT · αλκοόλ</summary>
          <div className="q">
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
        {scoreRow("AUDIT", auditS)}
        {q.dast && (
          <>
            <details className="sec" style={{ margin: "12px 16px" }}>
              <summary>DAST-10 · ουσίες</summary>
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
            {scoreRow("DAST-10", dastS)}
          </>
        )}
        {q.pgsi && (
          <>
            <details className="sec" style={{ margin: "12px 16px" }}>
              <summary>PGSI · τζόγος</summary>
              <div className="q">
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
            {scoreRow("PGSI", pgsiS)}
          </>
        )}
        <div className="q muted small">Δοκιμή: τα κείμενα των ερωτηματολογίων είναι προσωρινά, μέχρι τις άδειες.</div>
      </details>

      <details className="sec">
        <summary>Προηγούμενες θεραπείες {mark(done.treat)}</summary>
        {d.treatments.map((t, i) => {
          const upd = (patch: Partial<typeof t>) => set("treatments", d.treatments.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="q">
              <div className="row spread"><strong>{i + 1}.</strong><button type="button" className="small" onClick={() => set("treatments", d.treatments.filter((_, j) => j !== i))}>Αφαίρεση</button></div>
              {chipsOne(TREATMENT_WHERE, t.where, (v) => upd({ where: v ?? TREATMENT_WHERE[0] }))}
              <input style={{ marginTop: 8 }} aria-label="Πού" placeholder="Πού (π.χ. όνομα μονάδας)" value={t.whereText} onChange={(e) => upd({ whereText: e.target.value })} />
              <div className="grid2" style={{ marginTop: 8 }}>
                <input aria-label="Πότε" placeholder="Πότε (π.χ. 2021)" value={t.when} onChange={(e) => upd({ when: e.target.value })} />
                <input aria-label="Πόσο" placeholder="Πόσο (π.χ. 6 μήνες)" value={t.duration} onChange={(e) => upd({ duration: e.target.value })} />
              </div>
              <div className="lab small" style={{ marginTop: 8 }}>Πώς τελείωσε</div>
              {chipsOne(TREATMENT_END, t.ended, (v) => upd({ ended: v }))}
              <textarea style={{ marginTop: 8, minHeight: 60 }} aria-label="Τι βοήθησε" placeholder="Τι βοήθησε, τι όχι" value={t.helped} onChange={(e) => upd({ helped: e.target.value })} />
            </div>
          );
        })}
        <div className="q"><button type="button" onClick={() => set("treatments", [...d.treatments, { where: TREATMENT_WHERE[0], whereText: "", when: "", duration: "", helped: "" }])}>+ Προσθήκη θεραπείας</button></div>
        {line("longestAbstinence", "Μεγαλύτερη περίοδος αποχής", "π.χ. 2 χρόνια")}
        {txt("longestHelped", "Τι τη βοήθησε")}
        {txt("longestEnded", "Τι την έληξε")}
      </details>

      <details className="sec">
        <summary>Ψυχιατρικό και φάρμακα {mark(done.psych)}</summary>
        <div className="q">
          <div className="lab">Διαγνώσεις που του/της έχουν πει</div>
          <div className="chips">
            {DIAGNOSES.map((o) => <button key={o} type="button" className="chip" aria-pressed={d.diagnoses.includes(o)} onClick={() => set("diagnoses", d.diagnoses.includes(o) ? d.diagnoses.filter((x) => x !== o) : [...d.diagnoses, o])}>{o}</button>)}
          </div>
          <input style={{ marginTop: 8 }} aria-label="Άλλη διάγνωση" placeholder="Άλλο, με λόγια" value={d.diagnosesText} onChange={(e) => set("diagnosesText", e.target.value)} />
        </div>
        {yn("hospitalisedEver", "Νοσηλεία σε ψυχιατρική κλινική ποτέ")}
        {yn("attemptEver", "Απόπειρα / αυτοτραυματισμός ποτέ", <span className="small">Κάνε και την αξιολόγηση αναγκών ασφάλειας (03).</span>)}
        {yn("psychoticNow", "Ψυχωσικά συμπτώματα τώρα", <span className="small" style={{ color: "var(--red)" }}>Ειδοποιείται αμέσως όλη η ομάδα.</span>)}
        <div className="q">
          <div className="lab">Τραύμα <span className="muted small">(χωρίς λεπτομέρειες)</span></div>
          {chipsOne(TRAUMA, d.trauma, (v) => set("trauma", v))}
        </div>
        {d.meds.map((m, i) => {
          const upd = (patch: Partial<typeof m>) => set("meds", d.meds.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="q">
              <div className="row spread"><strong>Φάρμακο {i + 1}</strong><button type="button" className="small" onClick={() => set("meds", d.meds.filter((_, j) => j !== i))}>Αφαίρεση</button></div>
              <div className="grid2" style={{ marginTop: 6 }}>
                <input aria-label="Φάρμακο" placeholder="Φάρμακο" value={m.name} onChange={(e) => upd({ name: e.target.value })} />
                <input aria-label="Δόση" placeholder="Δόση" value={m.dose} onChange={(e) => upd({ dose: e.target.value })} />
              </div>
              <input style={{ marginTop: 8 }} aria-label="Για ποιο λόγο" placeholder="Για ποιο λόγο" value={m.why} onChange={(e) => upd({ why: e.target.value })} />
              <div className="lab small" style={{ marginTop: 8 }}>Το παίρνει όπως γράφεται</div>
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
        {yn("pregnant", "Εγκυμοσύνη τώρα / πιθανή", <span className="small" style={{ color: "var(--red)" }}>Ειδοποιείται αμέσως όλη η ομάδα· παραπομπή σε γιατρό.</span>)}
        {txt("healthNote", "Κάτι για την υγεία του/της που πρέπει να ξέρουμε;")}
      </details>

      <details className="sec">
        <summary>Νομικά {mark(done.legal)}</summary>
        {yn("courtObligation", "Υποχρέωση θεραπείας / βεβαίωσης από δικαστήριο")}
        {yn("prisonRecent", "Βγήκε από φυλακή τους τελευταίους 3 μήνες", <span className="small">Αυξημένος κίνδυνος υπερδοσολογίας.</span>)}
        {showAdminFields && (d.courtObligation || d.legalDetail) && txt("legalDetail", "Λεπτομέρειες (τι βεβαιώνουμε και σε ποιον) · τις βλέπει μόνο η διαχείριση")}
      </details>

      <details className="sec">
        <summary>Οικογένεια {mark(done.family)}</summary>
        {yn("children", "Παιδιά κάτω των 18", (
          <div className="row spread" style={{ flexWrap: "nowrap", gap: 10 }}>
            <span>Ανησυχία για την ασφάλειά τους</span>
            <span className="yn" role="group" aria-label="Ανησυχία για παιδί">
              <button type="button" aria-pressed={d.childConcern === true} onClick={() => set("childConcern", d.childConcern === true ? undefined : true)}>Ναι</button>
              <button type="button" aria-pressed={d.childConcern === false} onClick={() => set("childConcern", d.childConcern === false ? undefined : false)}>Όχι</button>
            </span>
          </div>
        ))}
        {d.children && d.childConcern && txt("childConcernText", "Τι ανησυχεί · ειδοποιείται αμέσως όλη η ομάδα")}
        {yn("violence", "Βία στο σπίτι (δέχεται ή ασκεί)")}
        {d.violence && txt("violenceText", "Με λίγα λόγια · ειδοποιείται αμέσως όλη η ομάδα")}
      </details>

      <details className="sec">
        <summary>Κίνητρο {mark(done.motive)}</summary>
        {txt("whyNow", "«Γιατί τώρα;» (με τα λόγια του/της)")}
        <div className="q">
          <div className="lab">Αποχή</div>
          {chipsOne(ABSTINENCE, d.abstinence, (v) => set("abstinence", v))}
        </div>
        {txt("workOn", "Τι θέλει να δουλέψει στον εαυτό του/της")}
        {txt("strengths", "Δυνάμεις")}
        {txt("fears", "Τι φοβάται από τη συνεργασία μαζί μας")}
      </details>

      <details className="sec" open={!d.summary}>
        <summary>Σύνοψη για την ομάδα {mark(done.summary)}</summary>
        {txt("summary", "5–8 γραμμές: τι τον/την φέρνει εδώ · τι συντηρεί τον εθισμό · τι προστατεύει · τι χρειάζεται πρώτα", "Το πρώτο που θα διαβάσει κάθε θεραπευτής στον φάκελο", 6)}
      </details>

      <div className="sticky-save">
        <button type="submit" name="complete" value="0">Αποθήκευση</button>
        {!complete && <button type="submit" name="complete" value="1" className="primary">Ολοκλήρωση</button>}
      </div>
      <p className="muted small">Κάθε αποθήκευση κρατιέται με όνομα και ώρα· οι παλιές μορφές δεν σβήνονται.</p>
    </form>
  );
}
