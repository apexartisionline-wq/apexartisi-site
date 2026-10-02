import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { pendingAnnouncements } from "@/lib/announcements";
import { prisma } from "@/lib/db";

async function ack(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) return;
  const announcementId = String(formData.get("id"));
  await prisma.announcementAck.upsert({
    where: { announcementId_userId: { announcementId, userId: user.id } },
    create: { announcementId, userId: user.id },
    update: {},
  });
  revalidatePath("/", "layout");
}

// Πρώτο πράγμα στην αρχική: οι ανακοινώσεις που δεν έχουν κλείσει.
export async function Announcements() {
  const user = await currentUser();
  if (!user) return null;
  const items = await pendingAnnouncements(user);
  return (
    <>
      {items.map((a) => (
        <section key={a.id} className="card" style={{ borderColor: "var(--accent)" }} aria-label="Ανακοίνωση">
          <div className="small muted">Ανακοίνωση</div>
          <strong>{a.title}</strong>
          {a.body && <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>}
          <form action={ack}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit">Εντάξει</button>
          </form>
        </section>
      ))}
    </>
  );
}
