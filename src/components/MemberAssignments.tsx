import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { notifyMembers } from "@/lib/notify";
import { formatDate, localParts } from "@/lib/time";

async function give(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) return;
  await prisma.assignment.create({
    data: { memberId, title, instructions: String(formData.get("instructions") ?? "").slice(0, 5000), createdById: user.id },
  });
  await notifyMembers([memberId], { title: "Νέα εργασία στη βιβλιοθήκη", url: "/m/library", tag: "assignment" });
  revalidatePath(`/t/members/${memberId}`);
}

// Προσωπική βιβλιοθήκη του μέλους, όπως τη βλέπουν οι θεραπευτές.
export async function MemberAssignments({ memberId }: { memberId: string }) {
  const [items, staff] = await Promise.all([
    prisma.assignment.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      include: { photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] } }, select: { id: true, name: true } }),
  ]);
  const who = new Map(staff.map((s) => [s.id, s.name]));
  return (
    <>
      <details className="card">
        <summary><strong>Νέα εργασία</strong></summary>
        <form action={give}>
          <input type="hidden" name="memberId" value={memberId} />
          <div className="field">
            <label htmlFor="a-title">Τίτλος</label>
            <input id="a-title" name="title" required maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="a-instr">Οδηγίες</label>
            <textarea id="a-instr" name="instructions" maxLength={5000} />
          </div>
          <button className="primary" type="submit">Αποστολή στο μέλος</button>
        </form>
      </details>
      {items.map((a) => (
        <section key={a.id} className="card">
          <div className="row spread">
            <strong>{a.title}</strong>
            <span className="small muted">{formatDate(localParts(a.createdAt).date)} · {who.get(a.createdById) ?? ""}</span>
          </div>
          {a.answeredAt ? (
            <>
              {dec(a.answer) && <p style={{ whiteSpace: "pre-wrap" }}>{dec(a.answer)}</p>}
              {a.photos.map((p) => (
                <a key={p.id} href={`/api/assignments/photo/${p.id}`} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assignments/photo/${p.id}`} alt="Φωτογραφία εργασίας" style={{ maxWidth: 160, marginRight: 8, borderRadius: 6 }} />
                </a>
              ))}
            </>
          ) : (
            <p className="small muted">Δεν έχει απαντηθεί ακόμα.</p>
          )}
        </section>
      ))}
    </>
  );
}
