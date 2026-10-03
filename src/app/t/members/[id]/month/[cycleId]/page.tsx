import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { hideOther, nameVariants } from "@/lib/pair-note";
import { vocative } from "@/lib/vocative";
import { cyclePicture, cycleReviews } from "@/lib/cycle-review";
import { prisma } from "@/lib/db";
import { formatDate, formatWhen, localParts } from "@/lib/time";

// Μηνιαίος φάκελος (ένας «μήνας» = ένας κύκλος): ό,τι χρειάζεται αν κάποιος ρωτήσει
// «τι έκανε αυτός ο άνθρωπος αυτόν τον μήνα» — εικόνα, ανασκόπηση, σημειώματα, στόχοι, μήνυμα.
export default async function MonthFolder({ params }: { params: Promise<{ id: string; cycleId: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id, cycleId } = await params;
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  const cycle = await prisma.cycle.findFirst({
    where: { id: cycleId, memberId: id },
    include: { bookings: { include: { slot: { include: { note: { include: { therapist: { select: { name: true } } } }, pairNotes: { where: { memberId: id }, include: { therapist: { select: { name: true } } } }, bookings: { where: { memberId: { not: id } }, select: { member: { select: { name: true } } } }, therapist: { select: { name: true } } } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  if (!member || !cycle) notFound();
  await logAccess(user.id, id, "month_folder_view");
  const cycles = await prisma.cycle.findMany({ where: { memberId: id }, orderBy: { startedAt: "asc" }, select: { id: true } });
  const n = cycles.findIndex((c) => c.id === cycle.id) + 1;
  const [pic, reviews, msg] = await Promise.all([
    cyclePicture(id, { ...cycle, bookings: cycle.bookings.map((b) => ({ ...b, slot: { startsAt: b.slot.startsAt, date: b.slot.date } })) }),
    cycleReviews(id),
    prisma.monthlyMessage.findUnique({ where: { cycleId } }),
  ]);
  const review = reviews.find((r) => r.cycleId === cycleId);

  return (
    <main>
      <p className="no-print" style={{ margin: "8px 0 0" }}><Link href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <h1 style={{ marginBottom: 4 }}>{member.name} · Μήνας {n}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{formatDate(pic.from)} – {formatDate(pic.to)}</p>
      <p className="no-print"><PrintButton /></p>

      <h2>Εικόνα του μήνα</h2>
      <div className="card stack small">
        <div>Ατομικές: <strong>{pic.sessions.done} από {pic.sessions.total}</strong>{pic.sessions.came < pic.sessions.done && <span className="muted"> (ήρθε σε {pic.sessions.came})</span>} · Ομάδες: <strong>{pic.groups.came} από {pic.groups.total}</strong></div>
        <div>Απογραφές: <strong>{pic.journal.written} από {pic.journal.days} μέρες</strong> · Κόκκινο κουμπί: <strong>{pic.help}</strong></div>
        <div>Νηφαλιότητα: <strong>{pic.soberDays ?? "—"} μέρες</strong>{pic.relapses ? ` · ${pic.relapses} αλλαγή ημερομηνίας` : ""}</div>
      </div>

      <h2>Ανασκόπηση θεραπευτή</h2>
      {review ? (
        <div className="card">
          <div className="muted small">Πώς πάνε οι στόχοι</div><div className="body-text">{review.goals}</div>
          <div className="muted small" style={{ marginTop: 8 }}>Πώς δούλεψε, τι εικόνα είχε</div><div className="body-text">{review.memberSays}</div>
          <div className="muted small" style={{ marginTop: 8 }}>{review.author} · {formatWhen(review.at)}</div>
        </div>
      ) : <div className="card muted small">Δεν έχει γραφτεί. <Link className="no-print" href={`/t/members/${id}/cycle`}>Γράψε την ›</Link></div>}

      <h2>Στόχοι εβδομάδας</h2>
      {pic.weeks.length === 0 ? <div className="card muted small">Δεν έβαλε στόχους.</div> : (
        <div className="list">{pic.weeks.map((w) => <div key={w.week} style={{ display: "block" }}><div className="sub">Εβδομάδα {formatDate(w.week)}</div><div>«{w.text}» · Ναι {w.yes} · Λίγο {w.partly} · Όχι {w.no}</div></div>)}</div>
      )}

      <h2>Ατομικές και σημειώματα</h2>
      {cycle.bookings.map((b, i) => { const note = b.slot.kind === "PAIR" ? b.slot.pairNotes[0] : b.slot.note; return (
        <div key={b.id} className="card small">
          <strong>{i + 1}. {formatDate(b.slot.date)}</strong> · {b.slot.kind === "PAIR" ? "Therapair" : "Ατομική"} · {note?.therapist.name ?? b.slot.therapist?.name ?? ""}{b.slot.startsAt > new Date() ? " · προγραμματισμένη" : !b.joinedAt && " · δεν ήρθε"}
          {note ? <div className="body-text" style={{ marginTop: 6 }}>{b.slot.kind === "PAIR" ? hideOther(dec(note.content), b.slot.bookings.flatMap((o) => nameVariants(o.member.name, vocative))) : dec(note.content)}</div> : <div className="muted">Χωρίς σημείωμα.</div>}
        </div>
      ); })}

      <h2>Μήνυμα προς το μέλος</h2>
      {msg?.sentAt ? (
        <div className="card"><div className="muted small">Στάλθηκε {formatDate(localParts(msg.sentAt).date)}</div><div className="body-text">{dec(msg.text)}</div></div>
      ) : <div className="card muted small">Δεν έχει σταλεί ακόμα.</div>}
    </main>
  );
}
