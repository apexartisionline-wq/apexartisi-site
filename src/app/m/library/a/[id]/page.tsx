import { ErrorNote, PageHead } from "@/components/ui";
import { notFound, redirect } from "next/navigation";
import { requireProgramMember } from "@/lib/intake";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { PHOTOS_PER_ASSIGNMENT } from "@/lib/library";
import { notifyUsers } from "@/lib/notify";
import { STEP_MODES, isStepMode } from "@/lib/step-modes";
import { formatDate, formatWhen, localParts } from "@/lib/time";

const ERR: Record<string, string> = {
  empty: "Διάλεξε μια φωτογραφία.",
  many: `Έως ${PHOTOS_PER_ASSIGNMENT} φωτογραφίες ανά εργασία.`,
  type: "Δεν ανέβηκε. Δοκίμασε μια φωτογραφία (JPG/PNG, έως 12 MB).",
  pdf: "Διάλεξε το συμπληρωμένο PDF.",
  size: "Το PDF είναι πάνω από 5 MB.",
  pdftype: "Το αρχείο δεν είναι PDF.",
};
const OK: Record<string, string> = { "1": "Αποθηκεύτηκε ✓", pdf: "Ανέβηκε το συμπληρωμένο PDF ✓", notebook: "Σημειώθηκε ότι το έγραψες στο τετράδιό σου ✓" };

// Τρόπος «PDF · στο τετράδιο»: το μέλος σημειώνει ότι το έγραψε (μία ώρα, η πρώτη φορά μένει).
async function markNotebook(formData: FormData) {
  "use server";
  const user = await requireProgramMember();
  const id = String(formData.get("id"));
  const a = await prisma.assignment.findFirst({ where: { id, memberId: user.id, mode: "PDF_NOTEBOOK" }, select: { id: true, notebookAt: true, answeredAt: true, createdById: true } });
  if (!a) notFound();
  if (!a.notebookAt) {
    const now = new Date();
    await prisma.assignment.update({ where: { id }, data: { notebookAt: now, answeredAt: a.answeredAt ?? now } });
    if (!a.answeredAt) await notifyUsers([a.createdById], { title: "Απάντηση σε εργασία", url: `/t/members/${user.id}/assignments`, tag: "assignment" });
  }
  redirect(`/m/library/a/${id}?ok=notebook`);
}

async function saveAnswer(formData: FormData) {
  "use server";
  const user = await requireProgramMember();
  const id = String(formData.get("id"));
  const answer = String(formData.get("answer") ?? "").slice(0, 20000);
  const a = await prisma.assignment.findFirst({ where: { id, memberId: user.id }, select: { answeredAt: true, createdById: true } });
  if (!a) notFound();
  await prisma.assignment.update({ where: { id }, data: { answer: enc(answer), answeredAt: new Date() } });
  if (!a.answeredAt) await notifyUsers([a.createdById], { title: "Απάντηση σε εργασία", url: `/t/members/${user.id}`, tag: "assignment" });
  redirect(`/m/library/a/${id}?ok=1`);
}

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const user = await requireProgramMember();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await prisma.assignment.findFirst({
    where: { id, memberId: user.id },
    include: { photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
    omit: { pdf: true, answerPdf: true }, // τα αρχεία δεν φορτώνονται στη σελίδα· ανοίγουν από το /api
  });
  if (!a) notFound();
  const mode = isStepMode(a.mode) ? a.mode : "FORM";
  const hasPdf = mode !== "FORM";
  return (
    <main>
      <PageHead title={a.title} sub={`${a.step ? `Βήμα ${a.step} · ` : ""}${formatDate(localParts(a.createdAt).date)}`} />
      {a.instructions && <div className="panel" style={{ whiteSpace: "pre-wrap" }}>{a.instructions}</div>}
      {sp.ok && <div className="notice">{OK[sp.ok] ?? OK["1"]}</div>}
      {sp.e && <ErrorNote>{ERR[sp.e] ?? "Κάτι πήγε στραβά."}</ErrorNote>}

      {hasPdf && (
        <div className="panel">
          <p style={{ margin: "0 0 8px" }}><strong>{STEP_MODES[mode].member}</strong></p>
          <a className="btn primary" href={`/api/assignments/${a.id}/pdf`} target="_blank" rel="noopener">Άνοιγμα του PDF</a>
          {mode === "PDF_NOTEBOOK" && <p className="small muted" style={{ margin: "8px 0 0" }}>Διάβασέ το και γράψε τις απαντήσεις σου στο τετράδιό σου. Όταν τελειώσεις, πάτα «Το έγραψα στο τετράδιό μου».</p>}
          {mode === "PDF_FILL" && <p className="small muted" style={{ margin: "8px 0 0" }}>Κατέβασέ το, συμπλήρωσέ το και ανέβασέ το εδώ.</p>}
        </div>
      )}

      {mode === "PDF_NOTEBOOK" && (
        <form action={markNotebook} className="panel">
          <input type="hidden" name="id" value={a.id} />
          {a.notebookAt
            ? <p style={{ margin: 0 }}>✓ Το έγραψες στο τετράδιό σου · {formatWhen(a.notebookAt)}</p>
            : <button className="primary" type="submit">Το έγραψα στο τετράδιό μου</button>}
        </form>
      )}

      {mode === "PDF_FILL" && (
        <form action={`/api/assignments/${a.id}/answer-pdf`} method="post" encType="multipart/form-data" className="panel">
          <label htmlFor="pdf"><strong>Ανέβασε το συμπληρωμένο PDF</strong> <span className="small muted">(ως 5 MB)</span></label>
          <input id="pdf" name="pdf" type="file" accept="application/pdf" required />
          {a.answerPdfAt && <p className="small" style={{ margin: "6px 0 0" }}>✓ Ανέβηκε {formatWhen(a.answerPdfAt)} · <a href={`/api/assignments/${a.id}/pdf?f=answer`} target="_blank" rel="noopener">Δες αυτό που ανέβασες</a>. Αν ανεβάσεις καινούργιο, αντικαθιστά το προηγούμενο.</p>}
          <button type="submit">Ανέβασμα</button>
        </form>
      )}

      {mode === "FORM" && (
        <form action={saveAnswer} className="panel">
          <input type="hidden" name="id" value={a.id} />
          <div className="field">
            <label htmlFor="answer"><strong>Γράψε εδώ</strong></label>
            <textarea id="answer" name="answer" rows={10} defaultValue={dec(a.answer)} />
          </div>
          <button className="primary" type="submit">Αποθήκευση</button>
        </form>
      )}

      {mode !== "PDF_FILL" && (
        <form action={`/api/assignments/${a.id}/photo`} method="post" encType="multipart/form-data" className="panel">
          <label htmlFor="photo"><strong>{mode === "PDF_NOTEBOOK" ? "Αν θέλεις, ανέβασε φωτογραφία από το τετράδιο" : "Ή ανέβασε φωτογραφία"}</strong>{mode === "FORM" && " (αν την έγραψες στο χαρτί)"}</label>
          <input id="photo" name="photo" type="file" accept="image/*" multiple required />
          <p className="small muted">Η τοποθεσία και τα στοιχεία της συσκευής αφαιρούνται από τη φωτογραφία.</p>
          <button type="submit">Ανέβασμα</button>
        </form>
      )}

      {a.photos.length > 0 && (
        <div className="stack">
          {a.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/api/assignments/photo/${p.id}`} alt="Φωτογραφία εργασίας" style={{ maxWidth: "100%", borderRadius: 8 }} />
          ))}
        </div>
      )}
    </main>
  );
}
