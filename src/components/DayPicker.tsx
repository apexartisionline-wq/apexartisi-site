"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Αλλαγή μέρας στο «Σήμερα»: μία μέρα ή μία εβδομάδα πίσω/μπροστά, ή όποια ημερομηνία θέλεις (ημερολόγιο).
export function DayPicker({ date, today, prev, next, prevWeek, nextWeek, base }: {
  date: string; today: string; prev: string; next: string; prevWeek: string; nextWeek: string; base: string;
}) {
  const router = useRouter();
  const go = (d: string) => (d === today ? base : `${base}?date=${d}`);
  return (
    <span className="day-picker" data-tour="days">
      <Link className="btn" href={go(prevWeek)} aria-label="Μία εβδομάδα πίσω" title="Μία εβδομάδα πίσω">«</Link>
      <Link className="btn" href={go(prev)} aria-label="Μία μέρα πίσω" title="Μία μέρα πίσω">‹</Link>
      <input
        type="date"
        aria-label="Διάλεξε ημερομηνία"
        value={date}
        onChange={(e) => e.target.value && router.push(go(e.target.value))}
      />
      <Link className="btn" href={go(next)} aria-label="Μία μέρα μπροστά" title="Μία μέρα μπροστά">›</Link>
      <Link className="btn" href={go(nextWeek)} aria-label="Μία εβδομάδα μπροστά" title="Μία εβδομάδα μπροστά">»</Link>
      {date !== today && <Link className="btn primary" href={base}>Σήμερα</Link>}
    </span>
  );
}
