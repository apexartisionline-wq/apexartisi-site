import { PLAN_FIELDS, type PlanData } from "@/lib/safety";

export function SafetyPlanForm({ plan, action, hidden }: { plan: PlanData | null; action: (fd: FormData) => Promise<void>; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="card">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {PLAN_FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={f.key}><strong>{f.label}</strong>{f.hint && <span className="muted"> — {f.hint}</span>}</label>
          <textarea id={f.key} name={f.key} defaultValue={plan?.[f.key] ?? ""} style={{ minHeight: 70 }} />
        </div>
      ))}
      <button className="primary" type="submit">Αποθήκευση</button>
    </form>
  );
}

export function SafetyPlanView({ plan }: { plan: PlanData }) {
  return (
    <div className="stack">
      {PLAN_FIELDS.filter((f) => plan[f.key]).map((f) => (
        <div key={f.key}>
          <strong>{f.label}</strong>
          <div className="body-text">{plan[f.key]}</div>
        </div>
      ))}
    </div>
  );
}
