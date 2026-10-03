import Link from "next/link";
import { NoteTags } from "@/components/NoteTags";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatDate, formatHour } from "@/lib/time";

// Ιστορικό ατομικών και Therapair ενός μέλους με τα σημειώματα όλων των θεραπευτών.
export async function MemberSessions({ memberId, limit = 30 }: { memberId: string; limit?: number }) {
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { memberId },
    include: {
      slot: {
        include: {
          therapist: { select: { name: true } },
          note: { include: { therapist: { select: { name: true } } } },
          // Therapair: μόνο το σημείωμα αυτού του μέλους, ποτέ του άλλου (ούτε το όνομά του).
          pairNotes: { where: { memberId }, include: { therapist: { select: { name: true } } } },
        },
      },
    },
    orderBy: { slot: { startsAt: "desc" } },
    take: limit,
  });
  if (bookings.length === 0) return <div className="card muted">Δεν υπάρχουν ατομικές ακόμα.</div>;
  return (
    <>
      {bookings.map((b) => {
        const past = b.slot.startsAt < now;
        const note = b.slot.kind === "PAIR" ? b.slot.pairNotes[0] : b.slot.note;
        return (
          <div className="card" key={b.id}>
            <div className="row spread small">
              <span>
                <Link href={`/t/s/${b.slot.id}`}><strong>{formatDate(b.slot.date)} {formatHour(b.slot.hour)}</strong></Link>
                {" · "}{b.slot.therapist?.name ?? "χωρίς θεραπευτή"}
                {b.slot.kind === "PAIR" && <> · <span className="badge">Therapair</span></>}
              </span>
              <span>
                {!past ? <span className="badge">προγραμματισμένη</span> : b.joinedAt ? <span className="badge ok">μπήκε</span> : <span className="badge yellow">δεν μπήκε</span>}
                {b.durationMinutes != null && <span className="muted"> · {b.durationMinutes}′</span>}
              </span>
            </div>
            {note ? (
              <div className="body-text" style={{ marginTop: 8 }}>
                {dec(note.content)}
                <NoteTags riskChange={note.riskChange} usedSince={note.usedSince} nextStep={dec(note.nextStep)} />
                <div className="muted small">— {note.therapist.name}</div>
              </div>
            ) : (
              past && <div className="muted small" style={{ marginTop: 8 }}>Χωρίς σημείωμα.</div>
            )}
          </div>
        );
      })}
    </>
  );
}
