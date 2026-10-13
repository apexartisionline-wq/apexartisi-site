import { GOAL_CHECK, goalWeek, recentGoals } from "@/lib/goals";
import { formatDate } from "@/lib/time";

const DAY = ["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"];
const MARK = { YES: "✓", PARTLY: "½", NO: "✕" } as const;

function Days({ days, detail }: { days: Awaited<ReturnType<typeof goalWeek>>["days"]; detail: boolean }) {
  return (
    <div className="goaldays" aria-label="Συνέπεια με τον στόχο, μέρα μέρα">
      {days.map((d, i) => (
        <span key={d.date} className={`gd ${d.check ? d.check.toLowerCase() : "none"}`} title={`${formatDate(d.date)}: ${d.check ? GOAL_CHECK[d.check] : "δεν σημείωσε"}${detail && d.note ? ` — ${d.note}` : ""}`}>
          <b>{d.check ? MARK[d.check] : "·"}</b>
          <small>{DAY[i]}</small>
        </span>
      ))}
    </div>
  );
}

/** Ο στόχος της εβδομάδας του μέλους και πώς πάει μέρα μέρα (για τη σελίδα της ατομικής). */
// detail: τα λόγια του μέλους δίπλα στο τσεκάρισμα είναι κείμενο ημερολογίου — τα βλέπει μόνο η διαχείριση (απόφαση 13/10).
export async function GoalWeekCard({ memberId, date, detail = false }: { memberId: string; date: string; detail?: boolean }) {
  const w = await goalWeek(memberId, date);
  const notes = detail ? w.days.filter((d) => d.note) : [];
  return (
    <div className="card">
      {w.goal ? (
        <>
          <div className="body-text">«{w.goal.text}»</div>
          <Days days={w.days} detail={detail} />
          <div className="small muted">Ναι {w.days.filter((d) => d.check === "YES").length} · Λίγο {w.days.filter((d) => d.check === "PARTLY").length} · Όχι {w.days.filter((d) => d.check === "NO").length}</div>
          {notes.length > 0 && (
            <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {notes.map((d) => <li key={d.date}><span className="muted">{formatDate(d.date)}:</span> {d.note}</li>)}
            </ul>
          )}
        </>
      ) : <span className="muted">Δεν έχει βάλει στόχο αυτή την εβδομάδα.</span>}
    </div>
  );
}

/** Οι στόχοι των τελευταίων εβδομάδων (για τον φάκελο). */
export async function RecentGoals({ memberId, today }: { memberId: string; today: string }) {
  const weeks = await recentGoals(memberId, today);
  if (weeks.length === 0) return <div className="card muted small">Δεν έχει βάλει ακόμα στόχο εβδομάδας.</div>;
  return (
    <div className="list">
      {weeks.map((w) => (
        <div key={w.week} style={{ display: "block" }}>
          <div className="sub">Εβδομάδα {formatDate(w.week)}</div>
          <div>«{w.goal!.text}»</div>
          <Days days={w.days} detail={false} />
        </div>
      ))}
    </div>
  );
}
