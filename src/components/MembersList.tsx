"use client";

import Link from "next/link";
import { useMemo } from "react";
import { norm, useListQuery } from "./list-query";
import { Icon } from "./Icon";

/**
 * Λίστα «Μέλη» (ανασχεδιασμός 16/10): αναζήτηση με όνομα (χωρίς τόνους) και φίλτρα μόνο σε κατηγορίες που υπάρχουν ήδη
 * στην εφαρμογή — τα επίπεδα των σημάτων («Χρειάζεται προσοχή» = κόκκινο, «Να το δεις» = κίτρινο), το σήμα «Χωρίς
 * καταγραφή» και «Χωρίς επόμενη ατομική». Οι αριθμοί μετρούν τις γραμμές που έδωσε ο server, τίποτα άλλο.
 * Παίρνει μόνο ό,τι έδειχνε ήδη η λίστα (όνομα, πρώτο σήμα, πόσα ακόμα, επόμενη ατομική)· η κατάσταση λέγεται πάντα
 * με λέξη και εικονίδιο, όχι μόνο με χρώμα.
 */
export type MemberRow = {
  id: string;
  name: string;
  level: "red" | "yellow" | null;
  top: string | null;
  more: number;
  overdue: boolean;
  noRecord: boolean;
  next: { when: string; time: string; who: string | null; pair: boolean } | null;
};

const FILTERS = [
  { key: "all", label: "Όλα", test: () => true },
  { key: "attention", label: "Χρειάζεται προσοχή", test: (r: MemberRow) => r.level === "red" },
  { key: "look", label: "Να το δεις", test: (r: MemberRow) => r.level === "yellow" },
  { key: "norecord", label: "Χωρίς καταγραφή", test: (r: MemberRow) => r.noRecord },
  { key: "nonext", label: "Χωρίς επόμενη ατομική", test: (r: MemberRow) => !r.next },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];


const BADGE = {
  red: { cls: "red", icon: "alert", label: "Χρειάζεται προσοχή" },
  yellow: { cls: "yellow", icon: "info", label: "Να το δεις" },
  none: { cls: "quiet", icon: "check", label: "Χωρίς σήμα" },
} as const;

export function MembersList({ rows, initialQ, initialF }: { rows: MemberRow[]; initialQ: string; initialF: string }) {
  const { q, setQ, f, setF } = useListQuery(FILTERS.map((x) => x.key), initialQ, initialF, "all");

  const byName = useMemo(() => {
    const nq = norm(q);
    return nq ? rows.filter((r) => norm(r.name).includes(nq)) : rows;
  }, [rows, q]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((x) => [x.key, byName.filter(x.test).length])) as Record<FilterKey, number>, [byName]);
  const shown = useMemo(() => byName.filter(FILTERS.find((x) => x.key === f)!.test), [byName, f]);
  const filterLabel = FILTERS.find((x) => x.key === f)!.label;

  return (
    <>
      <div className="members-tools">
        <label className="members-search">
          <span className="sr-only">Αναζήτηση μέλους με όνομα</span>
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση με όνομα" autoComplete="off" spellCheck={false} enterKeyHint="search" />
        </label>
        <div className="members-filters" role="group" aria-label="Φίλτρα">
          {FILTERS.map((x) => (
            <button key={x.key} type="button" className={`members-filter${x.key === "attention" ? " is-red" : ""}`} aria-pressed={f === x.key} onClick={() => setF(x.key)}>
              {x.label} <span className="members-count">{counts[x.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="members-result" aria-live="polite">
        {/* Μόνο όταν υπάρχει αναζήτηση ή φίλτρο — αλλιώς το «Ν ενεργά μέλη» της επικεφαλίδας αρκεί. */}
        {(f !== "all" || q.trim()) && `${shown.length} από ${rows.length} μέλη${f !== "all" ? ` · ${filterLabel}` : ""}${q.trim() ? ` · «${q.trim()}»` : ""}`}
      </p>

      {shown.length > 0 ? (
        <ul className="members-list">
          {shown.map((r) => {
            const b = BADGE[r.level ?? "none"];
            return (
              <li key={r.id}>
                <Link href={`/t/members/${r.id}`} className={`member-card${r.level ? ` is-${r.level}` : ""}${r.top ? "" : " no-alert"}`}>
                  <div className="member-main">
                    <span className="member-name">{r.name}</span>
                    <span className="member-badges">
                      <span className={`pill ${b.cls}`}><Icon name={b.icon} size={14} />{b.label}</span>
                      {r.overdue && <span className="pill red member-overdue"><Icon name="clock" size={14} />ΕΚΠΡΟΘΕΣΜΗ</span>}
                    </span>
                  </div>

                  {r.top && (
                    <div className={`member-alert ${r.level}`}>
                      <Icon name={r.level === "red" ? "alert" : "info"} size={16} />
                      <span>
                        {r.top}
                        {r.more > 0 && <span className="member-more"> · +{r.more} ακόμα</span>}
                      </span>
                    </div>
                  )}

                  <div className={`member-next${r.next ? "" : " none"}`}>
                    <Icon name="calendar" size={16} />
                    {r.next ? (
                      <span>
                        <span className="member-next-label">{r.next.pair ? "Επόμενο Therapair" : "Επόμενη ατομική"}</span>
                        <span className="member-next-when">{r.next.when} · {r.next.time}</span>
                        {r.next.who && <span className="member-next-who">{r.next.who}</span>}
                      </span>
                    ) : (
                      <span>Χωρίς επόμενη ατομική</span>
                    )}
                  </div>

                  <span className="member-open">
                    <span className="member-open-text">Φάκελος</span>
                    <Icon name="chevron" size={18} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="members-empty">
          <p>{rows.length === 0 ? "Δεν υπάρχουν ενεργά μέλη." : "Κανένα μέλος δεν ταιριάζει σε αυτή την αναζήτηση."}</p>
          {rows.length > 0 && (
            <button type="button" onClick={() => { setQ(""); setF("all"); }}>Καθαρισμός αναζήτησης και φίλτρου</button>
          )}
        </div>
      )}
    </>
  );
}
