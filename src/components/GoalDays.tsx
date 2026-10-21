import { GOAL_CHECK, type GoalCheck } from "@/lib/goals";
import { formatDate } from "@/lib/time";

const LETTERS = ["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"];

// Ο στόχος της εβδομάδας ως 7 μέρες (21/10, ιδέα από τους «στόχους με πρόοδο» των ανταγωνιστών — χωρίς ποσοστά, χωρίς μπάρα):
// Δευτέρα–Κυριακή, γεμάτος κύκλος = «Ναι», μισός = «Λίγο», άδειος = «Όχι σήμερα», ανοιχτός = χωρίς απάντηση, διακεκομμένος = δεν ήρθε ακόμα.
// Μόνο τα τσεκαρίσματα που ήδη γράφει το μέλος κάθε βράδυ στο ημερολόγιο (goalCheck)· κανένα νέο δεδομένο, κανένα κόκκινο.
export function GoalDays({ days, today }: { days: { date: string; check: GoalCheck | null }[]; today: string }) {
  return (
    <span className="goal-days" role="img" aria-label={days.map((d) => `${formatDate(d.date)}: ${d.check ? GOAL_CHECK[d.check] : d.date < today ? "χωρίς απάντηση" : "—"}`).join(", ")}>
      {days.map((d, i) => {
        const state = d.check ? d.check.toLowerCase() : d.date <= today ? "empty" : "future";
        return (
          <span key={d.date} className={`gd ${state}${d.date === today ? " today" : ""}`} title={`${formatDate(d.date)}${d.check ? `: ${GOAL_CHECK[d.check]}` : ""}`}>
            <i />
            {LETTERS[i]}
          </span>
        );
      })}
    </span>
  );
}
