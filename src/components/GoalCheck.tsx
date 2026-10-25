import { checkGoal } from "@/app/m/goal-actions";
import { GOAL_CHECK, type GoalCheck as Check } from "@/lib/goals";

// Τα τρία κουμπιά της μέρας πάνω στην κάρτα του στόχου (25/10). Το πατημένο φαίνεται· ξαναπάτημα σε άλλο = αλλαγή.
export function GoalCheck({ current, back }: { current: Check | null; back: "/m" | "/m/journal" }) {
  return (
    <form action={checkGoal} className="goal-check">
      <input type="hidden" name="back" value={back} />
      <div className="goal-q">Σήμερα ήμουν συνεπής με τον στόχο μου;</div>
      <div className="goal-btns">
        {(Object.keys(GOAL_CHECK) as Check[]).map((k) => (
          <button key={k} type="submit" name="check" value={k} className={`gbtn g-${k.toLowerCase()}${current === k ? " on" : ""}`} aria-pressed={current === k}>
            <i aria-hidden="true" />
            {GOAL_CHECK[k]}
          </button>
        ))}
      </div>
      <div className="hint">{current ? "Το σημείωσες για σήμερα ✓ Μπορείς να το αλλάξεις." : "Πάτα κάθε μέρα πώς πήγε. Οι κύκλοι από κάτω δείχνουν την εβδομάδα σου."}</div>
    </form>
  );
}
