"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon } from "./Icon";
import { norm, useListQuery } from "./list-query";

/**
 * «Άνθρωποι» της διαχείρισης (16/10: ίδιο περιβάλλον σε όλους τους ρόλους — όπως τα «Μέλη» του θεραπευτή): αναζήτηση με
 * όνομα ή όνομα χρήστη, φίλτρα στις κατηγορίες που ήδη υπάρχουν (ρόλος, ανενεργοί, εκκρεμής εχεμύθεια) και κάρτα ανά
 * λογαριασμό. Η πληροφορία είναι ακριβώς αυτή του παλιού πίνακα — τίποτα παραπάνω.
 */
export type PersonRow = {
  id: string;
  name: string;
  username: string;
  role: "MEMBER" | "THERAPIST" | "ADMIN";
  roleLabel: string;
  source: string | null;
  day: string | null;
  cycle: string | null;
  active: boolean;
  simple?: boolean; // απλή αρχική (επισκέπτης, 20/10)
  nda: string | null;
};

const FILTERS = [
  { key: "all", label: "Όλοι", test: () => true },
  { key: "member", label: "Μέλη", test: (r: PersonRow) => r.role === "MEMBER" },
  { key: "therapist", label: "Θεραπευτές", test: (r: PersonRow) => r.role === "THERAPIST" },
  { key: "admin", label: "Διαχείριση", test: (r: PersonRow) => r.role === "ADMIN" },
  { key: "inactive", label: "Ανενεργοί", test: (r: PersonRow) => !r.active },
  { key: "nda", label: "Εκκρεμεί εχεμύθεια", test: (r: PersonRow) => Boolean(r.nda) },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const ROLE_ICON = { MEMBER: "user", THERAPIST: "group", ADMIN: "shield" } as const;

export function PeopleList({ rows, showNda, initialQ = "", initialF = "all" }: { rows: PersonRow[]; showNda: boolean; initialQ?: string; initialF?: string }) {
  const filters = showNda ? FILTERS : FILTERS.filter((x) => x.key !== "nda");
  const { q, setQ, f, setF } = useListQuery(filters.map((x) => x.key), initialQ, initialF, "all");
  const byName = useMemo(() => {
    const nq = norm(q);
    return nq ? rows.filter((r) => norm(r.name).includes(nq) || norm(r.username).includes(nq)) : rows;
  }, [rows, q]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((x) => [x.key, byName.filter(x.test).length])) as Record<FilterKey, number>, [byName]);
  const current = FILTERS.find((x) => x.key === f)!;
  const shown = useMemo(() => byName.filter(current.test), [byName, current]);

  return (
    <>
      <div className="members-tools">
        <label className="members-search">
          <span className="sr-only">Αναζήτηση με όνομα ή όνομα χρήστη</span>
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση με όνομα ή χρήστη" autoComplete="off" spellCheck={false} enterKeyHint="search" />
        </label>
        <div className="members-filters" role="group" aria-label="Φίλτρα">
          {filters.map((x) => (
            <button key={x.key} type="button" className="members-filter" aria-pressed={f === x.key} onClick={() => setF(x.key)}>
              {x.label} <span className="members-count">{counts[x.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="members-result" aria-live="polite">
        {(f !== "all" || q.trim()) && `${shown.length} από ${rows.length}${f !== "all" ? ` · ${current.label}` : ""}${q.trim() ? ` · «${q.trim()}»` : ""}`}
      </p>

      {shown.length > 0 ? (
        <ul className="members-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/people/${r.id}`} className={`member-card no-alert${r.active ? "" : " is-inactive"}`}>
                <div className="member-main">
                  <span className="member-name">{r.name}</span>
                  <span className="person-user">@{r.username}</span>
                  <span className="member-badges">
                    <span className="pill quiet"><Icon name={ROLE_ICON[r.role]} size={14} />{r.roleLabel}</span>
                    {!r.active && <span className="pill quiet">ανενεργός</span>}
                    {r.simple && <span className="pill quiet">απλή αρχική</span>}
                    {r.nda && <span className="pill yellow"><Icon name="info" size={14} />{r.nda}</span>}
                  </span>
                </div>
                <div className="person-meta">
                  {r.source && <span>Προέλευση <b>{r.source}</b></span>}
                  {r.day && <span>Μέρα <b>{r.day}</b></span>}
                  {r.cycle && <span>Κύκλος <b>{r.cycle}</b></span>}
                </div>
                <span className="member-open">
                  <span className="member-open-text">Άνοιγμα</span>
                  <Icon name="chevron" size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="members-empty">
          <p>Κανείς δεν ταιριάζει σε αυτή την αναζήτηση.</p>
          <button type="button" onClick={() => { setQ(""); setF("all"); }}>Καθαρισμός αναζήτησης και φίλτρου</button>
        </div>
      )}
    </>
  );
}
