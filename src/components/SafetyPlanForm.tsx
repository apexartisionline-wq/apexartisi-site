import { Icon } from "@/components/Icon";
import { HELPERS_LABEL, HELPERS_MAX, HELPERS_NEXT_LABEL, PLAN_FIELDS, PLAN_ORDER, planHelpers, type PlanData, type PlanFieldKey } from "@/lib/safety-plan";
import s from "./SafetyPlanForm.module.css";

// «Το πλάνο μου όταν δυσκολεύομαι» (Α): 7 ερωτήσεις, με τα λόγια του μέλους. Οι διατυπώσεις των ερωτήσεων
// (safety-plan.ts) χρειάζονται έγκριση της θεραπευτικής ομάδας.
// staff: ο θεραπευτής γράφει μόνο ονόματα και δεν βλέπει τηλέφωνα· τα τηλέφωνα που υπάρχουν κρατιούνται.
// extra / finishLabel (2η ατομική, 17/10): προαιρετικό πλαίσιο από κάτω (π.χ. «λίγα λόγια») και δεύτερο κουμπί «Ολοκλήρωση…»
// που στέλνει complete=1· το «Αποθήκευση» μένει πρόχειρο/ενδιάμεση αποθήκευση.
export function SafetyPlanForm({ plan, action, hidden, staff = false, extra, finishLabel }: { plan: PlanData | null; action: (fd: FormData) => Promise<void>; hidden?: Record<string, string>; staff?: boolean; extra?: React.ReactNode; finishLabel?: string }) {
  const helpers = plan?.helperList ?? [];
  const ordinal = (i: number) => `${i + 1}ο πρόσωπο`;
  return (
    <form action={action} className={`card ${s.form}`}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {PLAN_ORDER.map((k) =>
        k === "helperList" ? (
          <div className={s.fieldq} key="helperList">
            <label htmlFor="helperName0">{HELPERS_LABEL}</label>
            <span className="hint">{HELPERS_NEXT_LABEL} Γράψε τους με τη σειρά: πρώτα ποιον καλείς πρώτο, μετά τον επόμενο.</span>
            {Array.from({ length: HELPERS_MAX }, (_, i) => (
              <div key={i} className={s.personRow}>
                <span className={s.num} aria-hidden>{i + 1}</span>
                <div className={s.two}>
                  <input id={`helperName${i}`} name={`helperName${i}`} aria-label={`${ordinal(i)}: όνομα`} placeholder={i === 0 ? "Όνομα (π.χ. Άννα, αδελφή)" : "Όνομα — αν δεν απαντήσει το προηγούμενο"} defaultValue={helpers[i]?.name ?? ""} />
                  {staff ? (
                    // Ο θεραπευτής γράφει μόνο ονόματα (απόφαση 5/10)· τα τηλέφωνα τα βάζουν το μέλος ή η διαχείριση.
                    <span className="muted small" style={{ alignSelf: "center" }}>{helpers[i]?.phone ? "τηλέφωνο ✓ (κρυφό)" : helpers[i]?.name ? "χωρίς τηλέφωνο ακόμα" : ""}</span>
                  ) : (
                    <input name={`helperPhone${i}`} aria-label={`${ordinal(i)}: τηλέφωνο`} type="tel" inputMode="tel" placeholder="Τηλέφωνο" defaultValue={helpers[i]?.phone ?? ""} />
                  )}
                </div>
              </div>
            ))}
            {staff && <div className="muted small">Εδώ γράφεις μόνο ονόματα. Τα τηλέφωνα τα βάζει το ίδιο το μέλος (στο «Το πλάνο μου») ή η διαχείριση, και τα βλέπουν μόνο αυτοί.</div>}
            {plan?.helpers && (
              <div className="field" style={{ marginTop: 10 }}>
                <label className="small muted" htmlFor="helpers" style={{ fontWeight: 500, fontSize: ".875rem" }}>
                  Παλιότερη καταγραφή σε ελεύθερο κείμενο — να περάσει στα ονόματα πάνω από άνθρωπο (δεν ταξινομείται αυτόματα)
                </label>
                <textarea id="helpers" name="helpers" defaultValue={plan.helpers} style={{ minHeight: 50 }} />
              </div>
            )}
          </div>
        ) : (
          field(PLAN_FIELDS.find((f) => f.key === k)!, plan)
        ),
      )}
      {extra}
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className={finishLabel ? "outline" : "primary"} type="submit">Αποθήκευση</button>
        {finishLabel && <button className="primary" type="submit" name="complete" value="1">{finishLabel}</button>}
      </div>
    </form>
  );
}

function field(f: (typeof PLAN_FIELDS)[number], plan: PlanData | null) {
  return (
    <div className={s.fieldq} key={f.key}>
      <label htmlFor={f.key}>{f.label}</label>
      {f.hint && <span className="hint">{f.hint}</span>}
      <textarea id={f.key} name={f.key} defaultValue={plan?.[f.key] ?? ""} />
    </div>
  );
}

/**
 * Το πλάνο όπως το βλέπει το μέλος: μικρές κάρτες, τα δικά του λόγια μεγάλα, η ερώτηση ως μικρή ετικέτα.
 * canCall: κουμπί κλήσης μόνο για όποιον δικαιούται να βλέπει τα τηλέφωνα (το μέλος)· στην προεπισκόπηση
 * του θεραπευτή το πλάνο έρχεται ήδη με «•••» (planForStaff) και χωρίς κουμπί κλήσης.
 */
// «Δώσε ζωή» (υπεύθυνη 23/10): στη σελίδα «Το σχέδιο ασφάλειάς μου» (lively) κάθε ερώτηση με εικονίδιο και χρωματιστή
// γραμμή. Μόνο εμφάνιση — κείμενα, σειρά και τηλέφωνα όπως πριν· στο κόκκινο κουμπί και στην ομάδα μένει το λιτό.
const PLAN_ICON: Record<string, string> = { warningSigns: "eye", myCoping: "leaf", distractions: "compass", helperList: "group", safeEnvironment: "shield", reasons: "target" };
export function SafetyPlanView({ plan, canCall = false, lively = false }: { plan: PlanData; canCall?: boolean; lively?: boolean }) {
  const helpers = planHelpers(plan);
  const text = (k: PlanFieldKey) => plan[k]?.trim();
  const ic = (k: string) => lively && <span className={s.ic} aria-hidden><Icon name={PLAN_ICON[k] ?? "info"} size={22} /></span>;
  return (
    <div className={`${s.cards}${lively ? ` ${s.lively}` : ""}`}>
      {PLAN_ORDER.map((k) => {
        if (k === "helperList") {
          if (helpers.length === 0 && !plan.helpers) return null;
          return (
            <section className={s.card} key="helperList" aria-label={HELPERS_LABEL} data-k="helperList">
              {ic("helperList")}
              <div className={s.body}>
              <span className={s.q}>{HELPERS_LABEL}</span>
              <ol className={s.people}>
                {helpers.map((h, i) => {
                  const hidden = h.phone === "•••";
                  const tel = canCall && h.phone && !hidden ? h.phone.replace(/\s/g, "") : null;
                  return (
                    <li key={i} className={s.person}>
                      <span className={s.num} aria-hidden>{i + 1}</span>
                      <span className={s.name}>{h.name || <span className="muted">(χωρίς όνομα)</span>}</span>
                      {tel ? (
                        <a className={`btn ${s.call}`} href={`tel:${tel}`} aria-label={`Κάλεσε ${h.name || "το " + (i + 1) + "ο πρόσωπο"}`}>
                          <Icon name="phone" size={18} /> Κάλεσε
                        </a>
                      ) : h.phone ? (
                        <span className="pill grey">{hidden ? "τηλέφωνο αποθηκευμένο" : h.phone}</span>
                      ) : (
                        <span className="pill grey">χωρίς τηλέφωνο</span>
                      )}
                      {i > 0 && <span className={s.next}>αν δεν απαντήσει {i === 1 ? "το 1ο" : `το ${i}ο`} πρόσωπο</span>}
                    </li>
                  );
                })}
              </ol>
              {plan.helpers && (
                <p className={`${s.a} ${s.old}`} style={{ marginTop: helpers.length ? 10 : 0 }}>
                  <span className="hint">Παλιότερη καταγραφή: </span>{plan.helpers}
                </p>
              )}
              </div>
            </section>
          );
        }
        const v = text(k);
        if (!v) return null;
        const f = PLAN_FIELDS.find((x) => x.key === k)!;
        return (
          <section className={s.card} key={k} aria-label={f.label} data-k={k}>
            {ic(k)}
            <div className={s.body}>
              <span className={s.q}>{f.label}</span>
              <p className={s.a}>{v}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
