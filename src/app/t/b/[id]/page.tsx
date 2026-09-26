import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionNumber } from "@/lib/member";
import { formatDate, formatHour } from "@/lib/time";

async function loadBooking(id: string, userId: string, isAdmin: boolean) {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { slot: true, member: { select: { id: true, name: true } }, note: true },
  });
  // Ο θεραπευτής βλέπει μόνο τις συνεδρίες που έχει αναλάβει.
  if (!b || (!isAdmin && b.slot.therapistId !== userId)) return null;
  return b;
}

async function saveNote(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("bookingId"));
  const content = z.string().trim().min(1).max(20000).parse(formData.get("content"));
  const b = await loadBooking(id, user.id, user.role === "ADMIN");
  if (!b) notFound();
  await prisma.sessionNote.upsert({
    where: { bookingId: id },
    create: { bookingId: id, therapistId: user.id, content },
    update: { content },
  });
  redirect(`/t/b/${id}?saved=1`);
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b = await loadBooking(id, user.id, user.role === "ADMIN");
  if (!b) notFound();

  // Τι δούλεψε ο προηγούμενος θεραπευτής (οι θεραπευτές αλλάζουν εναλλάξ).
  const [previous, number] = await Promise.all([
    prisma.sessionNote.findMany({
      where: { booking: { memberId: b.member.id, slot: { startsAt: { lt: b.slot.startsAt } } } },
      include: { therapist: { select: { name: true } }, booking: { include: { slot: true } } },
      orderBy: { booking: { slot: { startsAt: "desc" } } },
      take: 3,
    }),
    sessionNumber(b),
  ]);
  const past = b.slot.startsAt <= new Date();

  return (
    <main>
      <h1>{b.member.name}</h1>
      <p className="muted">
        {formatDate(b.slot.date)} στις {formatHour(b.slot.hour)} · δωμάτιο {b.slot.position}
        {number && ` · ${number}`}
      </p>

      <h2>Προηγούμενες συνεδρίες</h2>
      {previous.length === 0 && <p className="muted">Δεν υπάρχει προηγούμενο σημείωμα.</p>}
      {previous.map((n) => (
        <div className="card" key={n.id}>
          <div className="muted small">
            {formatDate(n.booking.slot.date)} · {n.therapist.name}
          </div>
          <div className="body-text">{n.content}</div>
        </div>
      ))}

      <h2>Σημείωμα αυτής της συνεδρίας</h2>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {past ? (
        <form action={saveNote} className="card">
          <input type="hidden" name="bookingId" value={b.id} />
          <textarea name="content" defaultValue={b.note?.content} required style={{ minHeight: 240 }} />
          <div className="row spread" style={{ marginTop: 12 }}>
            <span className="muted small">{b.note && `Τελευταία αλλαγή ${b.note.updatedAt.toLocaleString("el-GR", { timeZone: "Europe/Athens" })}`}</span>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
        </form>
      ) : (
        <p className="muted">Το σημείωμα γράφεται μετά τη συνεδρία.</p>
      )}
    </main>
  );
}
