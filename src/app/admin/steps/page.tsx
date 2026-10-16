import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { STEP_MODES, type StepMode } from "@/lib/step-modes";
import { prisma } from "@/lib/db";
import { currentStep, lastStepWork, STEPS } from "@/lib/steps";
import { stepTitle } from "@/lib/step-titles";
import { formatDate, localParts } from "@/lib/time";

// Η διαχείριση στέλνει τα βήματα (1–12) μέσα στην εφαρμογή· το μέλος τα βρίσκει στη «Βιβλιοθήκη» και οι θεραπευτές τα
// βλέπουν στον φάκελό του. Από 16/10 με τρεις τρόπους (src/lib/step-modes.ts): φόρμα μέσα στο Apex, PDF που γράφεται στο
// τετράδιο, PDF που συμπληρώνεται και ανεβαίνει. Η αποστολή γίνεται από το /api/steps (το PDF είναι μεγαλύτερο από 1 MB).
const ERR: Record<string, string> = {
  "1": "Διάλεξε βήμα, γράψε τίτλο και τσέκαρε τουλάχιστον ένα μέλος.",
  pdf: "Για βήμα με PDF, διάλεξε το αρχείο PDF.",
  size: "Το PDF είναι πάνω από 5 MB. Δοκίμασε μικρότερο αρχείο.",
  type: "Το αρχείο δεν είναι PDF.",
};

export default async function AdminSteps({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(members.map(async (m) => ({ m, step: await currentStep(m.id), work: await lastStepWork(m.id) })));

  return (
    <main>
      <h1>Βήματα</h1>
      <p className="muted">Στείλε ένα βήμα σε ένα ή περισσότερα μέλη. Το βρίσκουν στη «Βιβλιοθήκη» τους, με ειδοποίηση. Διάλεξε πώς θα το κάνουν: φόρμα μέσα στο Apex, PDF που το γράφουν στο τετράδιό τους, ή PDF που το συμπληρώνουν και το ανεβάζουν. Οι θεραπευτές βλέπουν στον φάκελο του μέλους σε ποιο βήμα είναι και τι έγραψε.</p>
      {sp.ok && <div className="notice">Στάλθηκε σε {sp.ok} {sp.ok === "1" ? "μέλος" : "μέλη"} ✓</div>}
      {sp.e && <div className="error">{ERR[sp.e] ?? ERR["1"]}</div>}

      <form action="/api/steps" method="post" encType="multipart/form-data" className="card step-form">
        <div className="field">
          <label htmlFor="s-step">Βήμα</label>
          <select id="s-step" name="step" required defaultValue="">
            <option value="" disabled>Διάλεξε βήμα</option>
            {STEPS.map((n) => <option key={n} value={n}>Βήμα {n} · {stepTitle(n)}</option>)}
          </select>
          <p className="hint" style={{ margin: "4px 0 0" }}>Ο τίτλος μπαίνει αυτόματα από το βήμα.</p>
        </div>
        <fieldset className="field step-modes">
          <legend>Πώς θα το κάνει το μέλος</legend>
          {(Object.keys(STEP_MODES) as StepMode[]).map((k) => (
            <label key={k} className="step-mode">
              <input type="radio" name="mode" value={k} defaultChecked={k === "FORM"} />
              <span><strong>{STEP_MODES[k].admin}</strong><span className="hint">{STEP_MODES[k].hint}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="field pdf-field">
          <label htmlFor="s-pdf">Αρχείο PDF του βήματος <span className="muted small">(ως 5 MB)</span></label>
          <input id="s-pdf" name="pdf" type="file" accept="application/pdf" />
        </div>
        <div className="field">
          <label htmlFor="s-instr">Οδηγίες / ερωτήσεις του βήματος <span className="muted small">(στο PDF: προαιρετικά, λίγα λόγια για το μέλος)</span></label>
          <textarea id="s-instr" name="instructions" maxLength={5000} rows={6} />
        </div>
        <fieldset className="field">
          <legend>Σε ποια μέλη</legend>
          <div className="steps-members">
            {rows.map(({ m, step }) => (
              <label key={m.id} className="row" style={{ gap: 8 }}>
                <input type="checkbox" name="member" value={m.id} style={{ width: "auto" }} />
                <span>{m.name} {step && <span className="muted small">· είναι στο βήμα {step.step}</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary" type="submit">Αποστολή</button>
      </form>

      <h2>Πού βρίσκεται κάθε μέλος</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Μέλος</th><th>Λέει ότι είναι στο</th><th>Τελευταίο βήμα που στάλθηκε</th></tr></thead>
          <tbody>
            {rows.map(({ m, step, work }) => (
              <tr key={m.id}>
                <td><Link href={`/admin/people/${m.id}`}>{m.name}</Link></td>
                <td>{step ? <>Βήμα {step.step} <span className="muted small">· {formatDate(localParts(step.createdAt).date)}</span></> : <span className="muted">δεν το έχει πει</span>}</td>
                <td>{work ? <>Βήμα {work.step} · {work.title} <span className="muted small">· {work.status}</span></> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
