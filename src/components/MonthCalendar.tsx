import Link from "next/link";
import { Icon } from "@/components/Icon";
import { addDays, mondayOf } from "@/lib/time";

const MONTHS = ["Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος", "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος"];
const HEAD = ["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"];

export type CalItem = { date: string; time: string; label: string };

/** «ΥΥΥΥ-ΜΜ» → πρώτη μέρα του μήνα, και ο προηγούμενος/επόμενος μήνας. */
export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const last = addDays(`${next}-01`, -1);
  return { y, m, first, last, next, prev };
}

/**
 * Ημερολόγιο μήνα του μέλους (υπεύθυνη 22/10: «στα ραντεβού να έχουμε calendar, να βλέπει ο άνθρωπος τα ραντεβού που έκανε
 * όλο τον μήνα»). Μόνο τα δικά του ραντεβού (ατομική / Therapair) με την ώρα — περασμένα και επόμενα με τον ίδιο τρόπο,
 * χωρίς «ήρθε / δεν ήρθε» και χωρίς κόκκινο (η παρουσία μένει στην ομάδα· κανένα «Δεν ήρθες» μπροστά στο μέλος).
 */
export function MonthCalendar({ ym, today, items, base }: { ym: string; today: string; items: CalItem[]; base: string }) {
  const { y, m, first, last, next, prev } = monthBounds(ym);
  const start = mondayOf(first);
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
  const cells: string[] = [];
  for (let d = start; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="mcal">
      <div className="mcal-head">
        <Link className="btn outline sm" href={`${base}?m=${prev}`} aria-label="Προηγούμενος μήνας"><Icon name="back" size={18} /></Link>
        <strong>{MONTHS[m - 1]} {y}</strong>
        <Link className="btn outline sm" href={`${base}?m=${next}`} aria-label="Επόμενος μήνας"><Icon name="chevron" size={18} /></Link>
      </div>
      <div className="mcal-grid" role="grid">
        {HEAD.map((h, i) => <span key={`h${i}`} className="mcal-dow">{h}</span>)}
        {cells.map((d) => {
          const its = byDay.get(d) ?? [];
          const out = d < first || d > last;
          return (
            <span key={d} className={`mcal-day${out ? " out" : ""}${its.length ? " has" : ""}${d === today ? " today" : ""}${d < today ? " past" : ""}`} title={its.map((i) => `${i.label} ${i.time}`).join(", ") || undefined}>
              <span className="mcal-n">{Number(d.slice(8))}</span>
              {!out && its.map((i) => <span key={i.time + i.label} className="mcal-t">{i.time}</span>)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
