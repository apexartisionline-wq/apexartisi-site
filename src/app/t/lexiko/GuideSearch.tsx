"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { entryText, type GuideSection, type GuideText, normalizeSearch } from "@/lib/guide";
import styles from "./page.module.css";

function Text({ value }: { value: GuideText }) {
  if (!Array.isArray(value)) return <p>{value}</p>;
  return <ul>{value.map((v) => <li key={v}>{v}</li>)}</ul>;
}

// Αναζήτηση που φιλτράρει τις απαντήσεις καθώς γράφεις (χωρίς τόνους, πεζά/κεφαλαία ίδια).
export function GuideSearch({ sections }: { sections: GuideSection[] }) {
  const [q, setQ] = useState("");
  const needle = normalizeSearch(q.trim());
  const shown = sections
    .map((s) => ({ ...s, entries: needle ? s.entries.filter((e) => normalizeSearch(entryText(e)).includes(needle)) : s.entries }))
    .filter((s) => s.entries.length > 0);
  const count = shown.reduce((n, s) => n + s.entries.length, 0);

  return (
    <>
      <div className={styles.search} role="search">
        <label htmlFor="guide-q" className={styles.searchLabel}><Icon name="search" /> <span>Αναζήτηση</span></label>
        <input
          id="guide-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="π.χ. απογραφές, Therapair, κόκκινο κουμπί"
          autoComplete="off"
        />
      </div>
      <p className="hint" aria-live="polite" style={{ margin: "0 0 12px" }}>
        {needle ? (count ? `${count} ${count === 1 ? "θέμα" : "θέματα"} για «${q.trim()}» — ανοιχτά για να τα διαβάσεις.` : "") : (
          <>Ενότητες: {sections.map((s, i) => <span key={s.id}>{i > 0 && " · "}<a href={`#${s.id}`}>{s.title}</a></span>)}</>
        )}
      </p>

      {needle && count === 0 && (
        <section className="panel">
          <p className="empty" style={{ margin: 0 }}>
            Δεν βρέθηκε κάτι για «{q.trim()}». Δοκίμασε μια άλλη λέξη (π.χ. «σημείωμα», «ασφάλεια»), ή ρώτα την υπεύθυνη — δεν συμπληρώνουμε κλινικές αποφάσεις μόνοι μας.
          </p>
          <button type="button" className="btn" onClick={() => setQ("")}>Δείξε όλα τα θέματα</button>
        </section>
      )}

      <div className="stackv">
        {shown.map((s) => (
          <section key={s.id} id={s.id} className="panel">
            <h2>{s.title}</h2>
            {s.entries.map((e) => (
              // Με αναζήτηση τα αποτελέσματα ανοίγουν μόνα τους· το key αλλάζει μόνο όταν μπαίνει/βγαίνει η αναζήτηση.
              <details key={`${e.id}-${needle ? 1 : 0}`} className={`fold ${styles.entry}`} open={needle ? true : undefined}>
                <summary>{e.term}</summary>
                <dl className={styles.answer}>
                  <dt>Τι είναι</dt>
                  <dd><Text value={e.what} /></dd>
                  <dt>Πότε το χρησιμοποιούμε</dt>
                  <dd><Text value={e.when} /></dd>
                  <dt>Ποιος κάνει τι</dt>
                  <dd><Text value={e.who} /></dd>
                  <dt>Πού γίνεται</dt>
                  <dd>
                    <p>
                      {e.where.text}
                      {e.where.href && <> <Link href={e.where.href}>{e.where.link ?? "Άνοιγμα"} ›</Link></>}
                    </p>
                  </dd>
                </dl>
              </details>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
