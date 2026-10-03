import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { currentStep, STEPS } from "@/lib/steps";
import { formatDate, localParts } from "@/lib/time";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", LINK: "Βίντεο" } as const;

// Το μέλος λέει σε ποιο βήμα βρίσκεται· κάθε αλλαγή κρατιέται ως νέα γραμμή.
async function saveStep(formData: FormData) {
  "use server";
  const user = await requireMember();
  const step = Number(formData.get("step"));
  if (!STEPS.includes(step)) redirect("/m/library");
  const cur = await currentStep(user.id);
  if (cur?.step !== step) await prisma.memberStep.create({ data: { memberId: user.id, step, byId: user.id } });
  redirect("/m/library?step=1");
}

export default async function MemberLibrary({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const [mine, shared, step] = await Promise.all([
    prisma.assignment.findMany({ where: { memberId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, step: true, createdAt: true, answeredAt: true } }),
    prisma.libraryItem.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, description: true } }),
    currentStep(user.id),
  ]);
  return (
    <main>
      <h1>Βιβλιοθήκη</h1>
      <form action={saveStep} className="card">
        <label htmlFor="step"><strong>Σε ποιο βήμα βρίσκεσαι;</strong></label>
        <p className="small muted" style={{ margin: "2px 0 8px" }}>Το βλέπουν οι θεραπευτές σου, για να ξέρουν πού είσαι.</p>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <select id="step" name="step" defaultValue={step?.step ?? ""} required style={{ flex: 1 }}>
            <option value="" disabled>Διάλεξε βήμα</option>
            {STEPS.map((n) => <option key={n} value={n}>Βήμα {n}</option>)}
          </select>
          <button className="primary" type="submit">Αποθήκευση</button>
        </div>
        {sp.step && <p className="notice" style={{ margin: "8px 0 0" }}>Αποθηκεύτηκε ✓</p>}
      </form>
      <h2>Οι εργασίες μου</h2>
      {mine.length === 0 ? (
        <p className="muted">Δεν έχεις εργασίες ακόμα.</p>
      ) : (
        <div className="stack">
          {mine.map((a) => (
            <Link key={a.id} href={`/m/library/a/${a.id}`} className="card row spread">
              <span>{a.step && <span className="badge">Βήμα {a.step}</span>} <strong>{a.title}</strong><br /><span className="small muted">{formatDate(localParts(a.createdAt).date)}</span></span>
              <span className="small">{a.answeredAt ? "✓ απαντήθηκε" : "να τη γράψω"}</span>
            </Link>
          ))}
        </div>
      )}
      <h2>Για όλους</h2>
      {shared.length === 0 ? (
        <p className="muted">Δεν υπάρχει υλικό ακόμα.</p>
      ) : (
        <div className="stack">
          {shared.map((i) => (
            <Link key={i.id} href={`/m/library/${i.id}`} className="card">
              <span className="small muted">{KIND[i.kind]}</span><br />
              <strong>{i.title}</strong>
              {i.description && <p className="small" style={{ margin: "4px 0 0" }}>{i.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
