import { prisma } from "@/lib/db";
import { formatDate, formatHour } from "@/lib/time";

// Ιστορικό ατομικών ενός μέλους με τα σημειώματα όλων των θεραπευτών.
export async function MemberSessions({ memberId, limit = 30 }: { memberId: string; limit?: number }) {
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { memberId },
    include: {
      slot: { include: { therapist: { select: { name: true } } } },
      note: { include: { therapist: { select: { name: true } } } },
    },
    orderBy: { slot: { startsAt: "desc" } },
    take: limit,
  });
  if (bookings.length === 0) return <div className="card muted">Δεν υπάρχουν ατομικές ακόμα.</div>;
  return (
    <>
      {bookings.map((b) => {
        const past = b.slot.startsAt < now;
        return (
          <div className="card" key={b.id}>
            <div className="row spread small">
              <span>
                <strong>{formatDate(b.slot.date)} {formatHour(b.slot.hour)}</strong> · {b.slot.therapist?.name ?? "χωρίς θεραπευτή"}
              </span>
              <span>
                {!past ? <span className="badge">προγραμματισμένη</span> : b.joinedAt ? <span className="badge ok">μπήκε</span> : <span className="badge yellow">δεν μπήκε</span>}
                {b.durationMinutes != null && <span className="muted"> · {b.durationMinutes}′</span>}
              </span>
            </div>
            {b.note ? (
              <div className="body-text" style={{ marginTop: 8 }}>
                {b.note.content}
                <div className="muted small">— {b.note.therapist.name}</div>
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
