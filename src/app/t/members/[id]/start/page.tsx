import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { memberIntake } from "@/lib/intake";
import { canMarkStep, CHOICE_LABEL, type Choice, PURPOSES, RISK_LEVELS, STAFF_STEPS } from "@/lib/intake-rules";
import { getSettings } from "@/lib/settings";
import { formatDate, localParts } from "@/lib/time";

async function mark(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const key = String(formData.get("key"));
  const step = STAFF_STEPS.find((s) => s.key === key);
  if (!step || !canMarkStep(step, user.therapistKind)) redirect(`/t/members/${memberId}/start?e=psy`);
  const value = key === "risk" ? String(formData.get("value") ?? "") : null;
  if (key === "risk" && !(value! in RISK_LEVELS)) redirect(`/t/members/${memberId}/start?e=risk`);
  // Το βήμα «πλάνο ασφάλειας» σημειώνεται μόνο αν το πλάνο έχει πράγματι γραφτεί.
  if (key === "safety_plan" && !(await prisma.safetyPlan.findUnique({ where: { memberId } }))) {
    redirect(`/t/members/${memberId}/start?e=plan`);
  }
  const note = enc(String(formData.get("note") ?? "").slice(0, 1000));
  await prisma.intakeCheck.upsert({
    where: { memberId_key: { memberId, key } },
    create: { memberId, key, value, note, doneById: user.id },
    update: { value, note, doneById: user.id, doneAt: new Date() },
  });
  redirect(`/t/members/${memberId}/start`);
}

async function unmark(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const key = String(formData.get("key"));
  const step = STAFF_STEPS.find((s) => s.key === key);
  if (!step || !canMarkStep(step, user.therapistKind)) redirect(`/t/members/${memberId}/start?e=psy`);
  await prisma.intakeCheck.deleteMany({ where: { memberId, key } });
  redirect(`/t/members/${memberId}/start`);
}

async function recordConsents(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const s = await getSettings();
  const previous = await prisma.consent.findMany({ where: { memberId }, orderBy: { recordedAt: "desc" } });
  const last = (purpose: string) => previous.find((r) => r.purpose === purpose);
  const rows = PURPOSES.filter((p) => !p.byMember).flatMap((p) => {
    const choice = String(formData.get(`c_${p.key}`) ?? "") as Choice;
    const detail = String(formData.get(`d_${p.key}`) ?? "").slice(0, 1000);
    if (!p.choices.includes(choice)) return [];
    // Νέα γραμμή μόνο όταν αλλάζει κάτι (ιστορικό, όχι αντίγραφα).
    const prev = last(p.key);
    if (prev && prev.choice === choice && dec(prev.detail) === detail) return [];
    return [{ memberId, purpose: p.key, choice, detail: enc(detail), version: s.consentVersion, recordedById: user.id }];
  });
  if (rows.length) await prisma.consent.createMany({ data: rows });
  redirect(`/t/members/${memberId}/start?ok=1`);
}

const ERR: Record<string, string> = {
  psy: "Αυτό το βήμα το σημειώνει ψυχολόγος.",
  risk: "Διάλεξε επίπεδο κινδύνου.",
  plan: "Γράψε πρώτα το πλάνο ασφάλειας μαζί με το μέλος· μετά σημείωσε το βήμα.",
};

export default async function IntakePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "intake_view");
  const [{ checks, consents, status }, history, staff] = await Promise.all([
    memberIntake(member),
    prisma.consent.findMany({ where: { memberId: id }, orderBy: { recordedAt: "desc" } }),
    prisma.user.findMany({ where: { role: { not: "MEMBER" } }, select: { id: true, name: true } }),
  ]);
  const who = new Map([...staff, { id: member.id, name: member.name }].map((u) => [u.id, u.name]));
  const byKey = new Map(checks.map((c) => [c.key, c]));
  const steps = STAFF_STEPS.filter((s) => !s.autognosiaOnly || member.source === "AUTOGNOSIA_PLUS");
  const lastDetail = (purpose: string) => dec(history.find((h) => h.purpose === purpose && h.detail)?.detail);

  return (
    <main>
      <p><Link href={`/t/members/${id}`}>← {member.name}</Link></p>
      <h1>Έναρξη συνεργασίας</h1>
      <div className={status.complete ? "notice" : "card"} style={status.complete ? undefined : { borderColor: "var(--yellow)" }}>
        {status.complete
          ? "Ολοκληρώθηκε ✓ Το μέλος έχει πλήρη πρόσβαση στο app."
          : `Λείπουν: ${[...status.missingSteps.map((s) => s.doc), ...status.missingConsents.map((p) => p.doc)].join(", ")}. Μέχρι τότε το μέλος βλέπει μόνο τη σελίδα έναρξης και το κόκκινο κουμπί.`}
      </div>
      {sp.e && <div className="error">{ERR[sp.e] ?? "Κάτι πήγε στραβά."}</div>}
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}

      <h2>Βήματα</h2>
      {steps.map((s) => {
        const c = byKey.get(s.key);
        const allowed = canMarkStep(s, user.therapistKind);
        return (
          <section key={s.key} className="card">
            <div className="row spread">
              <strong>{s.doc} · {s.label}</strong>
              {c && <span className="small">✓ {formatDate(localParts(c.doneAt).date)} · {who.get(c.doneById)}</span>}
            </div>
            {s.hint && <p className="small muted" style={{ margin: "4px 0" }}>{s.hint}</p>}
            {c?.value && <p className="small">Επίπεδο κινδύνου: <strong>{RISK_LEVELS[c.value as keyof typeof RISK_LEVELS]}</strong></p>}
            {c && dec(c.note) && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{dec(c.note)}</p>}
            {allowed ? (
              <form action={mark} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <input type="hidden" name="memberId" value={id} />
                <input type="hidden" name="key" value={s.key} />
                {s.key === "risk" && (
                  <select name="value" defaultValue={c?.value ?? ""} required style={{ width: "auto" }}>
                    <option value="" disabled>επίπεδο</option>
                    {Object.entries(RISK_LEVELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                <input name="note" placeholder="σύντομη σημείωση (προαιρετικό)" style={{ flex: 1, minWidth: 160 }} />
                <button type="submit" className={c ? undefined : "primary"}>{c ? "Ενημέρωση" : "Έγινε"}</button>
              </form>
            ) : (
              !c && <p className="small muted">Το σημειώνει ψυχολόγος.</p>
            )}
            {c && allowed && (
              <form action={unmark}>
                <input type="hidden" name="memberId" value={id} />
                <input type="hidden" name="key" value={s.key} />
                <button type="submit" style={{ padding: "4px 8px", marginTop: 6 }}>Αναίρεση</button>
              </form>
            )}
          </section>
        );
      })}

      <h2>Συγκαταθέσεις (01β)</h2>
      <p className="small muted">Τις συμπληρώνετε μαζί με το μέλος. Κάθε αλλαγή κρατιέται στο ιστορικό με την έκδοση του εγγράφου.</p>
      <form action={recordConsents} className="card">
        <input type="hidden" name="memberId" value={id} />
        {PURPOSES.filter((p) => !p.byMember).map((p) => (
          <fieldset key={p.key} className="field" style={{ border: 0, padding: 0 }}>
            <legend><strong>{p.doc} · {p.label}</strong>{p.required && " (απαραίτητο)"}</legend>
            <p className="small muted" style={{ margin: "2px 0 4px" }}>{p.text}</p>
            <div className="row" style={{ gap: 12 }}>
              {p.choices.map((c) => (
                <label key={c} className="row" style={{ gap: 4, margin: 0 }}>
                  <input type="radio" name={`c_${p.key}`} value={c} defaultChecked={consents[p.key] === c} style={{ width: "auto" }} />
                  {CHOICE_LABEL[c]}
                </label>
              ))}
            </div>
            {p.detail && <input name={`d_${p.key}`} placeholder={p.detail} defaultValue={lastDetail(p.key)} style={{ marginTop: 4 }} />}
          </fieldset>
        ))}
        <button className="primary" type="submit">Καταγραφή</button>
      </form>
      <p className="small">
        01δ · Δήλωση εμπιστευτικότητας: {consents.confidentiality === "YES" ? "το μέλος την αποδέχτηκε ✓" : "την αποδέχεται το μέλος μέσα στο app"}
      </p>

      {history.length > 0 && (
        <>
          <h2>Ιστορικό</h2>
          <table>
            <thead><tr><th>Πότε</th><th>Σκοπός</th><th>Επιλογή</th><th>Έκδοση</th><th>Από</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(localParts(h.recordedAt).date)} {localParts(h.recordedAt).hour.toString().padStart(2, "0")}:{localParts(h.recordedAt).minute.toString().padStart(2, "0")}</td>
                  <td>{PURPOSES.find((p) => p.key === h.purpose)?.label ?? h.purpose}</td>
                  <td>{CHOICE_LABEL[h.choice as Choice] ?? h.choice}</td>
                  <td>{h.version}</td>
                  <td>{who.get(h.recordedById) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
