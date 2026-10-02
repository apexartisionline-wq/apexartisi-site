import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionNumber } from "@/lib/member";
import { formatDate, formatHour } from "@/lib/time";

async function loadSlot(id: string) {
  return prisma.slot.findUnique({
    where: { id },
    include: {
      therapist: { select: { name: true } },
      bookings: { include: { member: { select: { id: true, name: true } } } },
      note: { include: { therapist: { select: { name: true } } } },
    },
  });
}

// Όλοι οι θεραπευτές βλέπουν όλες τις συνεδρίες· το σημείωμα το γράφει όποιος
// έχει την ώρα (ή η Εύα), ώστε να μη σβήνει κανείς κατά λάθος σημείωμα άλλου.
const canWrite = (x: { therapistId: string | null }, user: { id: string; role: string }) =>
  user.role === "ADMIN" || x.therapistId === user.id;

async function saveNote(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("slotId"));
  const content = z.string().trim().min(1).max(20000).parse(formData.get("content"));
  const x = await loadSlot(id);
  if (!x || !canWrite(x, user)) notFound();
  await prisma.sessionNote.upsert({
    where: { slotId: id },
    create: { slotId: id, therapistId: user.id, content: enc(content) },
    update: { content: enc(content) },
  });
  redirect(`/t/s/${id}?saved=1`);
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const x = await loadSlot(id);
  if (!x) notFound();
  for (const b of x.bookings) await logAccess(user.id, b.memberId, "session_view");
  const pair = x.kind === "PAIR";

  // Τι δουλεύτηκε πριν, για κάθε μέλος (οι θεραπευτές αλλάζουν εναλλάξ).
  const members = await Promise.all(
    x.bookings.map(async (b) => ({
      booking: b,
      number: await sessionNumber({ cycleId: b.cycleId, slot: x }),
      previous: await prisma.sessionNote.findMany({
        where: { slot: { startsAt: { lt: x.startsAt }, bookings: { some: { memberId: b.memberId } } } },
        include: { therapist: { select: { name: true } }, slot: { select: { date: true, kind: true } } },
        orderBy: { slot: { startsAt: "desc" } },
        take: 3,
      }),
    })),
  );
  const past = x.startsAt <= new Date();

  return (
    <main>
      <p className="muted">
        {formatDate(x.date)} στις {formatHour(x.hour)} · δωμάτιο {x.position}
        {x.therapist && ` · ${x.therapist.name}`}
      </p>
      <h1>
        {pair && <span className="badge">Therapair</span>}{" "}
        {x.bookings.length === 0 ? "Χωρίς κράτηση" : x.bookings.map((b, i) => (
          <span key={b.id}>
            {i > 0 && " & "}
            <Link href={`/t/members/${b.member.id}`}>{b.member.name}</Link>
          </span>
        ))}
      </h1>

      {members.map(({ booking, number, previous }) => (
        <section key={booking.id}>
          <h2>
            Πριν: {booking.member.name} <span className="muted small">{number && `· ${number}`}</span>
          </h2>
          {previous.length === 0 && <p className="muted">Δεν υπάρχει προηγούμενο σημείωμα.</p>}
          {previous.map((n) => (
            <div className="card" key={n.id}>
              <div className="muted small">
                {formatDate(n.slot.date)} · {n.therapist.name}
                {n.slot.kind === "PAIR" && " · Therapair"}
              </div>
              <div className="body-text">{dec(n.content)}</div>
            </div>
          ))}
        </section>
      ))}

      <h2>{pair ? "Κοινό σημείωμα" : "Σημείωμα αυτής της συνεδρίας"}</h2>
      {pair && <p className="muted small">Φαίνεται στους φακέλους και των δύο μελών.</p>}
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {!canWrite(x, user) ? (
        x.note ? <div className="card body-text">{dec(x.note.content)}</div> : <p className="muted">Δεν έχει γραφτεί σημείωμα ακόμα.</p>
      ) : past && x.bookings.length > 0 ? (
        <form action={saveNote} className="card">
          <input type="hidden" name="slotId" value={x.id} />
          <textarea name="content" defaultValue={dec(x.note?.content)} required style={{ minHeight: 240 }} />
          <div className="row spread" style={{ marginTop: 12 }}>
            <span className="muted small">
              {x.note && `Τελευταία αλλαγή ${x.note.updatedAt.toLocaleString("el-GR", { timeZone: "Europe/Athens" })} · ${x.note.therapist.name}`}
            </span>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
        </form>
      ) : (
        <p className="muted">Το σημείωμα γράφεται μετά τη συνεδρία.</p>
      )}
    </main>
  );
}
