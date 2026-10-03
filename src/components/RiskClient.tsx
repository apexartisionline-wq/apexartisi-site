"use client";

import { useState } from "react";
import { ACTIONS, LEVELS, type Level, QUESTIONS, type RiskReview, riskSchema } from "@/lib/risk";

type YN = boolean | "DECLINED" | undefined;

// Αξιολόγηση αναγκών ασφάλειας: 4 ερωτήσεις, επίπεδο (απόφαση ψυχολόγου), μία σημείωση. Η αφορμή μπαίνει μόνη της.
export function RiskClient({ action, memberId, initialReason }: { action: (fd: FormData) => void; memberId: string; initialReason?: string }) {
  const [d, setD] = useState<Partial<RiskReview>>({ reason: initialReason as RiskReview["reason"] });
  const set = <K extends keyof RiskReview>(k: K, v: RiskReview[K]) => {
    setProblem(""); // μόλις διορθώσεις κάτι, φεύγει το παλιό μήνυμα
    setD((x) => ({ ...x, [k]: v }));
  };
  const level = d.level as Level | undefined;
  // Έλεγχος πριν φύγει: αν λείπει κάτι ή δεν υπάρχει σύνδεση, η φόρμα μένει όπως είναι.
  const [problem, setProblem] = useState("");
  const [warnedDeclined, setWarnedDeclined] = useState(false);
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const r = riskSchema.safeParse(d);
    let msg = !r.success ? (r.error.issues[0]?.message ?? "Κάτι λείπει.") : !navigator.onLine ? "Δεν υπάρχει σύνδεση στο ίντερνετ· πάτα ξανά μόλις επανέλθει." : "";
    // Ήπια υπενθύμιση: αν κάποιες ερωτήσεις έμειναν αναπάντητες, το λέμε μία φορά (με δεύτερο πάτημα αποθηκεύεται).
    const declined = QUESTIONS.filter(([k]) => d[k] === "DECLINED" || d[k] === undefined).length;
    if (!msg && declined && !warnedDeclined) {
      setWarnedDeclined(true);
      msg = `${declined} ${declined === 1 ? "ερώτηση έμεινε" : "ερωτήσεις έμειναν"} χωρίς απάντηση. Βεβαιώσου ότι το επίπεδο το στηρίζει αυτό που ξέρεις· αν θέλεις να αποθηκευτεί έτσι, πάτα ξανά «Αποθήκευση».`;
    }
    setProblem(msg);
    if (msg) e.preventDefault();
  };

  return (
    <form action={action} onSubmit={check}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      <details className="sec" open>
        <summary>Ερωτήσεις</summary>
        <div className="q muted small">💬 Ρώτα ευθέως· η ερώτηση δεν βάζει την ιδέα, συνήθως ανακουφίζει. Στο Zoom: ξέρε πού βρίσκεται τώρα.</div>
        {QUESTIONS.map(([k, q]) => {
          const v = d[k] as YN;
          const pick = (x: YN) => set(k, (v === x ? undefined : x) as never);
          return (
            <div key={k} className="q">
              <div className="lab">{q}</div>
              <span className="yn" role="group" aria-label={q}>
                <button type="button" aria-pressed={v === true} onClick={() => pick(true)}>Ναι</button>
                <button type="button" aria-pressed={v === false} onClick={() => pick(false)}>Όχι</button>
                <button type="button" aria-pressed={v === "DECLINED"} onClick={() => pick("DECLINED")}>Δεν απάντησε ακόμα</button>
              </span>
            </div>
          );
        })}
      </details>

      <details className="sec" open>
        <summary>Ανάγκες ασφάλειας</summary>
        <div className="q">
          <span className="yn" role="group" aria-label="Επίπεδο">
            {(Object.keys(LEVELS) as Level[]).map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => set("level", l)}>{LEVELS[l]}</button>
            ))}
          </span>
        </div>
        {level && (
          <div className="q" style={{ background: level === "HIGH" ? "color-mix(in srgb, var(--red) 12%, transparent)" : level === "MEDIUM" ? "color-mix(in srgb, var(--yellow) 12%, transparent)" : undefined }}>
            <strong className="small">Τι κάνουμε</strong>
            <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{ACTIONS[level].map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
        <div className="q">
          <div className="lab">Τι βλέπω και τι κάνουμε (2–3 γραμμές)</div>
          <textarea aria-label="Γιατί" rows={4} placeholder="π.χ. σκέψεις χωρίς πρόθεση μετά το κόκκινο κουμπί· ενημερώσαμε το πλάνο· τον παίρνει η Άννα αύριο" value={d.rationale ?? ""} onChange={(e) => set("rationale", e.target.value)} />
        </div>
      </details>

      {problem && <div className="error" role="alert">Δεν αποθηκεύτηκε ακόμα: {problem} Ό,τι έγραψες είναι εδώ.</div>}
      <div className="sticky-save">
        <button type="submit" className="primary">Αποθήκευση</button>
      </div>
      <p className="muted small" style={{ paddingBottom: 70 }}>Αποθηκεύεται με όνομα και ώρα· οι παλιές αξιολογήσεις μένουν στο ιστορικό.</p>
    </form>
  );
}
