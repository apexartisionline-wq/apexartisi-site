import { HELPERS_MAX, PLAN_FIELDS, type PlanData } from "@/lib/safety";

// staff: ο θεραπευτής δεν βλέπει τηλέφωνα — αν γράψει νέο, αντικαθιστά· αν το αφήσει κενό, κρατιέται το παλιό.
export function SafetyPlanForm({ plan, action, hidden, staff = false }: { plan: PlanData | null; action: (fd: FormData) => Promise<void>; hidden?: Record<string, string>; staff?: boolean }) {
  const helpers = plan?.helperList ?? [];
  return (
    <form action={action} className="card">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {PLAN_FIELDS.slice(0, 3).map((f) => field(f, plan))}
      <div className="field">
        <label><strong>Άνθρωποι που μπορώ να καλέσω</strong></label>
        {Array.from({ length: HELPERS_MAX }, (_, i) => (
          <div key={i} className="grid2" style={{ marginBottom: 6 }}>
            <input name={`helperName${i}`} aria-label={`Όνομα ${i + 1}`} placeholder="Όνομα (π.χ. Άννα, αδελφή)" defaultValue={helpers[i]?.name ?? ""} />
            <input
              name={`helperPhone${i}`}
              aria-label={`Τηλέφωνο ${i + 1}`}
              type="tel"
              inputMode="tel"
              placeholder={staff ? (helpers[i]?.phone ? "τηλέφωνο κρυφό ✓" : "τηλέφωνο") : "Τηλέφωνο"}
              defaultValue={staff ? "" : (helpers[i]?.phone ?? "")}
            />
          </div>
        ))}
        {staff && <div className="muted small">Τα τηλέφωνα τα βλέπει μόνο το μέλος (στο κόκκινο κουμπί) και η διαχείριση.</div>}
        {plan?.helpers && (
          <div className="field">
            <label className="small muted">Παλιό κείμενο</label>
            <textarea name="helpers" defaultValue={plan.helpers} style={{ minHeight: 50 }} />
          </div>
        )}
      </div>
      {PLAN_FIELDS.slice(3).map((f) => field(f, plan))}
      <button className="primary" type="submit">Αποθήκευση</button>
    </form>
  );
}

function field(f: (typeof PLAN_FIELDS)[number], plan: PlanData | null) {
  return (
    <div className="field" key={f.key}>
      <label htmlFor={f.key}><strong>{f.label}</strong>{f.hint && <span className="muted"> — {f.hint}</span>}</label>
      <textarea id={f.key} name={f.key} defaultValue={plan?.[f.key] ?? ""} style={{ minHeight: 70 }} />
    </div>
  );
}

export function SafetyPlanView({ plan }: { plan: PlanData }) {
  const helpers = (plan.helperList ?? []).filter((h) => h.name || h.phone);
  return (
    <div className="stack">
      {PLAN_FIELDS.slice(0, 3).filter((f) => plan[f.key]).map((f) => (
        <div key={f.key}><strong>{f.label}</strong><div className="body-text">{plan[f.key]}</div></div>
      ))}
      {(helpers.length > 0 || plan.helpers) && (
        <div>
          <strong>Άνθρωποι που μπορώ να καλέσω</strong>
          {helpers.map((h, i) => (
            <div key={i}>{h.name}{h.phone && <> · {h.phone === "•••" ? "•••" : <a href={`tel:${h.phone.replace(/\s/g, "")}`}>{h.phone}</a>}</>}</div>
          ))}
          {plan.helpers && <div className="body-text">{plan.helpers}</div>}
        </div>
      )}
      {PLAN_FIELDS.slice(3).filter((f) => plan[f.key]).map((f) => (
        <div key={f.key}><strong>{f.label}</strong><div className="body-text">{plan[f.key]}</div></div>
      ))}
    </div>
  );
}
