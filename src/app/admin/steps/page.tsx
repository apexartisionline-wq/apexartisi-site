import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyMembers } from "@/lib/notify";
import { currentStep, lastStepWork, STEPS } from "@/lib/steps";
import { formatDate, localParts } from "@/lib/time";

// Η διαχείριση στέλνει τα βήματα (1–12) μέσα στην εφαρμογή· το μέλος τα γράφει στη «Βιβλιοθήκη»
// και οι θεραπευτές τα βλέπουν στον φάκελό του.
async function sendStep(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const step = Number(formData.get("step"));
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const instructions = String(formData.get("instructions") ?? "").slice(0, 5000);
  const memberIds = formData.getAll("member").map(String);
  if (!STEPS.includes(step) || !title || memberIds.length === 0) redirect("/admin/steps?e=1");
  const members = await prisma.user.findMany({ where: { id: { in: memberIds }, role: "MEMBER", active: true }, select: { id: true } });
  await prisma.assignment.createMany({ data: members.map((m) => ({ memberId: m.id, step, title, instructions, createdById: user.id })) });
  await notifyMembers(members.map((m) => m.id), { title: `Βήμα ${step}: νέα εργασία στη βιβλιοθήκη`, url: "/m/library", tag: "assignment" });
  redirect(`/admin/steps?ok=${members.length}`);
}

export default async function AdminSteps({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(members.map(async (m) => ({ m, step: await currentStep(m.id), work: await lastStepWork(m.id) })));

  return (
    <main>
      <h1>Βήματα</h1>
      <p className="muted">Στείλε ένα βήμα σε ένα ή περισσότερα μέλη. Το βρίσκουν στη «Βιβλιοθήκη» τους, με ειδοποίηση, και το γράφουν εκεί. Οι θεραπευτές βλέπουν στον φάκελο του μέλους σε ποιο βήμα είναι και τι γράφει.</p>
      {sp.ok && <div className="notice">Στάλθηκε σε {sp.ok} {sp.ok === "1" ? "μέλος" : "μέλη"} ✓</div>}
      {sp.e && <div className="error">Διάλεξε βήμα, γράψε τίτλο και τσέκαρε τουλάχιστον ένα μέλος.</div>}

      <form action={sendStep} className="card">
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 140 }}>
            <label htmlFor="s-step">Βήμα</label>
            <select id="s-step" name="step" required defaultValue="">
              <option value="" disabled>—</option>
              {STEPS.map((n) => <option key={n} value={n}>Βήμα {n}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="s-title">Τίτλος</label>
            <input id="s-title" name="title" required maxLength={200} placeholder="π.χ. Παραδέχτηκα ότι…" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-instr">Οδηγίες / ερωτήσεις του βήματος</label>
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
