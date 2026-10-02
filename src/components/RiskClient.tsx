"use client";

import { useState } from "react";
import { ACTIONS, LEVELS, type Level, QUESTIONS, REASONS, type RiskReview, suggestedLevel } from "@/lib/risk";

type YN = boolean | "DECLINED" | undefined;

// Αξιολόγηση αναγκών ασφάλειας: 4 ερωτήσεις, πρόταση επιπέδου, απόφαση ψυχολόγου, τι κάνουμε.
export function RiskClient({ action, memberId, initialReason }: { action: (fd: FormData) => void; memberId: string; initialReason?: string }) {
  const [d, setD] = useState<Partial<RiskReview>>({ reason: initialReason as RiskReview["reason"] });
  const set = <K extends keyof RiskReview>(k: K, v: RiskReview[K]) => setD((x) => ({ ...x, [k]: v }));
  const suggestion = suggestedLevel(d);
  const level = d.level as Level | undefined;

  return (
    <form action={action}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      <details className="sec" open>
        <summary>Αφορμή</summary>
        <div className="q">
          <div className="chips">
            {REASONS.map((r) => <button key={r} type="button" className="chip" aria-pressed={d.reason === r} onClick={() => set("reason", d.reason === r ? undefined : r)}>{r}</button>)}
          </div>
        </div>
      </details>

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
                <button type="button" aria-pressed={v === "DECLINED"} onClick={() => pick("DECLINED")}>Όχι ακόμα</button>
              </span>
            </div>
          );
        })}
        {suggestion && <div className="q small">Πρόταση από τις απαντήσεις: <strong>{LEVELS[suggestion]}</strong> <span className="muted">· αποφασίζεις εσύ· αν διστάζεις, το υψηλότερο</span></div>}
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
          <div className="lab">Γιατί (2–3 γραμμές)</div>
          <textarea aria-label="Γιατί" rows={3} value={d.rationale ?? ""} onChange={(e) => set("rationale", e.target.value)} />
        </div>
        {level && level !== "LOW" && (
          <div className="q">
            <div className="lab">Τι έγινε / ποιος θα κάνει τι</div>
            <textarea aria-label="Τι έγινε" rows={3} placeholder="π.χ. ενημερώσαμε το πλάνο· τον παίρνει η Άννα αύριο 12:00· ενημερώθηκε η Εύα" value={d.actions ?? ""} onChange={(e) => set("actions", e.target.value)} />
          </div>
        )}
      </details>

      <div className="sticky-save">
        <button type="submit" className="primary">Αποθήκευση</button>
      </div>
      <p className="muted small" style={{ paddingBottom: 70 }}>Αποθηκεύεται με όνομα και ώρα· οι παλιές αξιολογήσεις μένουν στο ιστορικό.</p>
    </form>
  );
}
