import Link from "next/link";
import { sinceLast } from "@/lib/since-last";
import { GOAL_CHECK } from "@/lib/goals";
import { formatDate } from "@/lib/time";

const num = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));
const dates = (ds: string[]) => ds.map(formatDate).join(", ");

/**
 * «Από την προηγούμενη ατομική ως σήμερα»: το τελευταίο σημείωμα, οι ομάδες και οι απογραφές
 * ανάμεσα στις δύο ατομικές — για τον θεραπευτή που μπαίνει (οι θεραπευτές εναλλάσσονται).
 */
export async function SinceLast({ memberId, prev, until, compact = false }: {
  memberId: string;
  prev: { date: string; by: string; text: string; slotId: string; pair: boolean } | null;
  until: string;
  compact?: boolean;
}) {
  if (!prev) return null;
  const d = await sinceLast(memberId, prev.date, until);
  const j = d.journal;
  const cameN = d.groups.filter((g) => g.came).length;
  const goalTotal = j.goal.YES + j.goal.PARTLY + j.goal.NO;
  return (
    <div className="card since">
      {!compact && (
        <details>
          <summary>
            <strong>Το τελευταίο σημείωμα</strong>{" "}
            <span className="muted small">· {prev.pair ? "Therapair · " : ""}{formatDate(prev.date)} · {prev.by}</span>
          </summary>
          <div className="body-text" style={{ marginTop: 8 }}>{prev.text}</div>
          <Link className="small" href={`/t/s/${prev.slotId}`}>Άνοιγμα της ατομικής ›</Link>
        </details>
      )}
      <ul className="since-list">
        <li>
          <strong>Ομάδες:</strong>{" "}
          {d.groups.length === 0 ? <span className="muted">δεν έγινε ομάδα στο διάστημα.</span> : (
            <>
              ήρθε σε <strong>{cameN} από {d.groups.length}</strong>
              <span className="since-days">
                {d.groups.map((g) => (
                  <span key={`${g.date}${g.time}`} className={`chip ${g.came ? "ok" : "no"}`} title={g.came ? "ήρθε" : "δεν ήρθε"}>
                    {formatDate(g.date)} {g.came ? "✓" : "✗"}
                  </span>
                ))}
              </span>
            </>
          )}
        </li>
        <li>
          <strong>Απογραφές:</strong>{" "}
          {j.days === 0 ? <span className="muted">δεν πέρασε ολόκληρη μέρα από την προηγούμενη ατομική.</span> : j.written === 0 ? <span className="warn-text">δεν έγραψε καμία ({j.days} {j.days === 1 ? "μέρα" : "μέρες"}).</span> : (
            <>
              έγραψε <strong>{j.written} από {j.days}</strong> μέρες · διάθεση {num(j.mood)}/10 · λαχτάρα {num(j.craving)}/10 · ύπνος {num(j.sleep)} ώρες · σιγουριά για αύριο {num(j.confidence)}/10
              {j.topCraving && <> · <span className="warn-text">πιο δυνατή λαχτάρα {j.topCraving.value}/10 ({formatDate(j.topCraving.date)})</span></>}
            </>
          )}
        </li>
        {(j.used.length > 0 || j.selfHarm.length > 0 || d.help > 0) && (
          <li className="warn-text">
            {j.used.length > 0 && <>Έγραψε ότι έκανε χρήση: {dates(j.used)}. </>}
            {j.selfHarm.length > 0 && <>Σκέψεις να κάνει κακό στον εαυτό του/της: {dates(j.selfHarm)}. </>}
            {d.help > 0 && <>Κόκκινο κουμπί: {d.help} {d.help === 1 ? "φορά" : "φορές"}.</>}
          </li>
        )}
        {goalTotal > 0 && (
          <li><strong>Στόχος εβδομάδας:</strong> {GOAL_CHECK.YES} {j.goal.YES} · {GOAL_CHECK.PARTLY} {j.goal.PARTLY} · {GOAL_CHECK.NO} {j.goal.NO}</li>
        )}
        {j.wins.length > 0 && (
          <li><strong>Νίκες:</strong> {j.wins.map((w) => `«${w.text}» (${formatDate(w.date)})`).join(" · ")}</li>
        )}
      </ul>
      <Link className="small" href={`/t/members/${memberId}/journal`}>Όλες οι απογραφές, μέρα-μέρα ›</Link>
    </div>
  );
}
