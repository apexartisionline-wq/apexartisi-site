"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type GateItem = { id: string; href: string; when: string; who: string; kind: string };

/**
 * Πύλη «Εκκρεμεί σημείωμα» (17/10): καλύπτει όλη την οθόνη του θεραπευτή μέχρι να γραφτεί το σημείωμα της συνεδρίας που τελείωσε.
 * Μένουν ανοιχτά: οι σελίδες των ίδιων των εκκρεμών συνεδριών (εκεί γράφεται), το κόκκινο κουμπί, ο «Λογαριασμός».
 */
export function NoteGate({ items }: { items: GateItem[] }) {
  const path = usePathname() ?? "";
  if (items.length === 0) return null;
  const allowed = items.some((i) => path === `/t/s/${i.id}` || path.startsWith(`/t/s/${i.id}/`)) || path.startsWith("/t/help") || path.startsWith("/account") || path.startsWith("/nda");
  if (allowed) return null;
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <h1 id="gate-title">Εκκρεμεί σημείωμα</h1>
        <p>
          {items.length === 1 ? "Μία συνεδρία σου τελείωσε χωρίς σημείωμα." : `${items.length} συνεδρίες σου τελείωσαν χωρίς σημείωμα.`} Για να συνεχίσεις στο Apex, γράψε το πρώτα — ή σημείωσε «Δεν ήρθε» αν το μέλος δεν ήρθε. Έτσι ο επόμενος θεραπευτής ξέρει τι έγινε.
        </p>
        <ul className="gate-list">
          {items.map((i) => (
            <li key={i.id}>
              <span><strong>{i.kind}</strong> · {i.who} · {i.when}</span>
              <Link className="btn primary sm" href={i.href}>Γράψε το σημείωμα</Link>
            </li>
          ))}
        </ul>
        <p className="hint">Το κόκκινο κουμπί και ο «Λογαριασμός» μένουν ανοιχτά. Όσο τρέχει άλλη συνεδρία ή ομάδα σου, η οθόνη αυτή δεν βγαίνει.</p>
      </div>
    </div>
  );
}
