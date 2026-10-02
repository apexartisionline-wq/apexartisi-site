import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NoteTags } from "@/components/NoteTags";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RISK_CHANGE, USED_SINCE } from "@/lib/handover-rules";
import { sessionNumber } from "@/lib/member";
import { formatDate, formatHour, formatWhen } from "@/lib/time";

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

const NOTE_MAX = 20000;
const noteSchema = z.object({
  content: z.string().trim().min(1).max(NOTE_MAX),
  riskChange: z.enum(["UP", "SAME", "DOWN"]),
  usedSince: z.enum(["YES", "NO", "UNKNOWN"]),
  nextStep: z.string().trim().max(1000),
});

async function saveNote(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("slotId"));
  const x = await loadSlot(id);
  if (!x || !canWrite(x, user)) notFound();
  // Ο browser ελέγχει ήδη τα πεδία· αν κάτι ξεφύγει, μήνυμα αντί για σφάλμα 500.
  const parsed = noteSchema.safeParse({
    content: formData.get("content") ?? "",
    riskChange: formData.get("riskChange"),
    usedSince: formData.get("usedSince"),
    nextStep: formData.get("nextStep") ?? "",
  });
  if (!parsed.success) redirect(`/t/s/${id}?error=1`);
  const { content, riskChange, usedSince, nextStep } = parsed.data;
  const data = { content: enc(content), riskChange, usedSince, nextStep: enc(nextStep) };
  if (x.note) {
    // Η προηγούμενη μορφή δεν σβήνεται: κρατιέται στο ιστορικό.
    await prisma.$transaction([
      prisma.sessionNoteVersion.create({
        data: { noteId: x.note.id, content: x.note.content, riskChange: x.note.riskChange, usedSince: x.note.usedSince, nextStep: x.note.nextStep, editorId: user.id },
      }),
      prisma.sessionNote.update({ where: { id: x.note.id }, data }),
    ]);
  } else {
    await prisma.sessionNote.create({ data: { slotId: id, therapistId: user.id, ...data } });
  }
  redirect(`/t/s/${id}?saved=1`);
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
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
  const versions = x.note
    ? await prisma.sessionNoteVersion.findMany({ where: { noteId: x.note.id }, orderBy: { createdAt: "desc" } })
    : [];
  const editors = await prisma.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.editorId))] } }, select: { id: true, name: true } });

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
              <NoteTags riskChange={n.riskChange} usedSince={n.usedSince} nextStep={dec(n.nextStep)} />
            </div>
          ))}
        </section>
      ))}

      <h2>{pair ? "Κοινό σημείωμα" : "Σημείωμα αυτής της συνεδρίας"}</h2>
      {pair && <p className="muted small">Φαίνεται στους φακέλους και των δύο μελών.</p>}
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.error && <div className="error">Το σημείωμα δεν αποθηκεύτηκε: συμπλήρωσε ανάγκες ασφάλειας και χρήση (και το κείμενο έως {NOTE_MAX.toLocaleString("el-GR")} χαρακτήρες).</div>}
      {!canWrite(x, user) ? (
        x.note ? (
          <div className="card">
            <div className="body-text">{dec(x.note.content)}</div>
            <NoteTags riskChange={x.note.riskChange} usedSince={x.note.usedSince} nextStep={dec(x.note.nextStep)} />
          </div>
        ) : <p className="muted">Δεν έχει γραφτεί σημείωμα ακόμα.</p>
      ) : past && x.bookings.length > 0 ? (
        <form action={saveNote} className="card">
          <input type="hidden" name="slotId" value={x.id} />
          <textarea name="content" defaultValue={dec(x.note?.content)} required maxLength={NOTE_MAX} style={{ minHeight: 240 }} />
          <div className="row" style={{ flexWrap: "wrap", gap: 16, marginTop: 12 }}>
            <label className="field">
              Ανάγκες ασφάλειας σε σχέση με πριν
              <select name="riskChange" required defaultValue={x.note?.riskChange ?? ""}>
                <option value="" disabled>—</option>
                {Object.entries(RISK_CHANGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              Χρήση από την προηγούμενη επαφή
              <select name="usedSince" required defaultValue={x.note?.usedSince ?? ""}>
                <option value="" disabled>—</option>
                {Object.entries(USED_SINCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            Επόμενο βήμα
            <input name="nextStep" defaultValue={dec(x.note?.nextStep)} maxLength={1000} placeholder="τι συμφωνήσαμε / τι να δει ο επόμενος" />
          </label>
          <div className="row spread" style={{ marginTop: 12 }}>
            <span className="muted small">
              {x.note && `Τελευταία αλλαγή ${formatWhen(x.note.updatedAt)} · ${x.note.therapist.name}`}
            </span>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
        </form>
      ) : (
        <p className="muted">Το σημείωμα γράφεται μετά τη συνεδρία.</p>
      )}
      {versions.length > 0 && (
        <details className="card small">
          <summary>Ιστορικό αλλαγών ({versions.length})</summary>
          {versions.map((v) => (
            <div key={v.id} style={{ marginTop: 12 }}>
              <div className="muted">
                Πριν από την αλλαγή της {formatWhen(v.createdAt)} · {editors.find((e) => e.id === v.editorId)?.name ?? "—"}
              </div>
              <div className="body-text">{dec(v.content)}</div>
              <NoteTags riskChange={v.riskChange} usedSince={v.usedSince} nextStep={dec(v.nextStep)} />
            </div>
          ))}
        </details>
      )}
    </main>
  );
}
