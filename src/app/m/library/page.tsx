import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHead, Panel, Pill } from "@/components/ui";
import { RedirectType, redirect } from "next/navigation";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { currentStep, STEPS } from "@/lib/steps";
import { memberStepStatus } from "@/lib/step-modes";
import { formatDate, localParts } from "@/lib/time";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", IMAGE: "Εικόνα", LINK: "Βίντεο" } as const;
const KIND_ICON = { PDF: "doc", AUDIO: "chat", VIDEO: "video", IMAGE: "eye", LINK: "video" } as const;

// Το μέλος λέει σε ποιο βήμα βρίσκεται· κάθε αλλαγή κρατιέται ως νέα γραμμή.
async function saveStep(formData: FormData) {
  "use server";
  const user = await requireMember();
  const step = Number(formData.get("step"));
  if (!STEPS.includes(step)) redirect("/m/library");
  const cur = await currentStep(user.id);
  if (cur?.step !== step) await prisma.memberStep.create({ data: { memberId: user.id, step, byId: user.id } });
  redirect("/m/library?step=1", RedirectType.replace);
}

export default async function MemberLibrary({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const [mine, shared, step] = await Promise.all([
    prisma.assignment.findMany({ where: { memberId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, step: true, createdAt: true, answeredAt: true, mode: true, notebookAt: true, answerPdfAt: true } }),
    prisma.libraryItem.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, description: true } }),
    currentStep(user.id),
  ]);
  return (
    <main>
      {/* «Βιβλιοθήκη» → «Οι εργασίες μου» (υπεύθυνη 22/10)· ίδια διεύθυνση /m/library. */}
      <PageHead title="Οι εργασίες μου" sub="Το βήμα σου, οι εργασίες σου και το υλικό του προγράμματος" />
      <Panel title="Σε ποιο βήμα βρίσκεσαι;" icon="compass">
        <form action={saveStep}>
          <p className="hint" style={{ margin: "0 0 8px" }}>Το βλέπει η ομάδα σου, για να ξέρει πού είσαι.</p>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <select id="step" name="step" aria-label="Βήμα" defaultValue={step?.step ?? ""} required style={{ flex: 1 }}>
              <option value="" disabled>Διάλεξε βήμα</option>
              {STEPS.map((n) => <option key={n} value={n}>Βήμα {n}</option>)}
            </select>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
          {sp.step && <p className="notice" style={{ margin: "8px 0 0" }}>Αποθηκεύτηκε ✓</p>}
        </form>
      </Panel>
      <Panel title="Εργασίες" icon="doc">
        {mine.length === 0 ? (
          <EmptyState>Δεν έχεις εργασίες ακόμα.</EmptyState>
        ) : (
          // «Δώσε ζωή» (23/10): οι εργασίες σαν πορεία — ✓ όσες ολοκληρώθηκαν, τονισμένη η πρώτη που μένει, οι υπόλοιπες ήπια.
          <ol className="tasks-tl">
            {mine.map((a, i) => {
              // Ίδιοι κανόνες κατάστασης με θεραπευτές και διαχείριση (step-modes.ts), με τα λόγια του μέλους.
              const st = memberStepStatus(a);
              const current = !st.done && mine.findIndex((x) => !memberStepStatus(x).done) === i;
              return (
                <li key={a.id} className={st.done ? "done" : current ? "now" : "todo"}>
                  <span className="tl-dot" aria-hidden>{st.done && <Icon name="check" size={14} />}</span>
                  <Link href={`/m/library/a/${a.id}`} className="linkrow">
                    <span className="iconbox"><Icon name="doc" size={20} /></span>
                    <span className="grow">
                      <div style={{ fontWeight: 600 }}>{a.step ? `Βήμα ${a.step} · ` : ""}{a.title}</div>
                      <div className="hint">{formatDate(localParts(a.createdAt).date)}</div>
                      <div style={{ marginTop: 6 }}><Pill tone={st.done ? "ok" : "grey"} icon={st.done ? "check" : undefined}>{st.text}</Pill></div>
                    </span>
                    <span className="arrow"><Icon name="chevron" /></span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
      <Panel title="Για όλους" icon="folder">
        {shared.length === 0 ? (
          <EmptyState>Δεν υπάρχει υλικό ακόμα.</EmptyState>
        ) : (
          shared.map((i) => (
            <Link key={i.id} href={`/m/library/${i.id}`} className="linkrow">
              <span className="iconbox"><Icon name={KIND_ICON[i.kind]} size={20} /></span>
              <span className="grow">
                <div style={{ fontWeight: 600 }}>{i.title}</div>
                <div className="hint">{KIND[i.kind]}{i.description ? ` · ${i.description}` : ""}</div>
              </span>
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          ))
        )}
      </Panel>
    </main>
  );
}
