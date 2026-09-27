import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { PHOTOS_PER_ASSIGNMENT } from "@/lib/library";
import { notifyUsers } from "@/lib/notify";
import { formatDate, localParts } from "@/lib/time";

const ERR: Record<string, string> = {
  empty: "Διάλεξε μια φωτογραφία.",
  many: `Έως ${PHOTOS_PER_ASSIGNMENT} φωτογραφίες ανά εργασία.`,
  type: "Δεν ανέβηκε. Δοκίμασε μια φωτογραφία (JPG/PNG, έως 12 MB).",
};

async function saveAnswer(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const id = String(formData.get("id"));
  const answer = String(formData.get("answer") ?? "").slice(0, 20000);
  const a = await prisma.assignment.findFirst({ where: { id, memberId: user.id } });
  if (!a) notFound();
  await prisma.assignment.update({ where: { id }, data: { answer: enc(answer), answeredAt: new Date() } });
  if (!a.answeredAt) await notifyUsers([a.createdById], { title: "Απάντηση σε εργασία", url: `/t/members/${user.id}`, tag: "assignment" });
  redirect(`/m/library/a/${id}?ok=1`);
}

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const user = await requireRole("MEMBER");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await prisma.assignment.findFirst({
    where: { id, memberId: user.id },
    include: { photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!a) notFound();
  return (
    <main>
      <p><Link href="/m/library">← Βιβλιοθήκη</Link></p>
      <h1>{a.title}</h1>
      <p className="small muted">{formatDate(localParts(a.createdAt).date)}</p>
      {a.instructions && <div className="card" style={{ whiteSpace: "pre-wrap" }}>{a.instructions}</div>}
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.e && <div className="error">{ERR[sp.e] ?? "Κάτι πήγε στραβά."}</div>}

      <form action={saveAnswer} className="card">
        <input type="hidden" name="id" value={a.id} />
        <div className="field">
          <label htmlFor="answer"><strong>Γράψε εδώ</strong></label>
          <textarea id="answer" name="answer" rows={10} defaultValue={dec(a.answer)} />
        </div>
        <button className="primary" type="submit">Αποθήκευση</button>
      </form>

      <form action={`/api/assignments/${a.id}/photo`} method="post" encType="multipart/form-data" className="card">
        <label htmlFor="photo"><strong>Ή ανέβασε φωτογραφία</strong> (αν την έγραψες στο χαρτί)</label>
        <input id="photo" name="photo" type="file" accept="image/*" multiple required />
        <p className="small muted">Η τοποθεσία και τα στοιχεία της συσκευής αφαιρούνται από τη φωτογραφία.</p>
        <button type="submit">Ανέβασμα</button>
      </form>

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
