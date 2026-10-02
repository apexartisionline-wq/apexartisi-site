import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
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
          bookings: { where: { memberId: { not: memberId } }, include: { member: { select: { name: true } } } },
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
        const partner = b.slot.bookings[0]?.member.name;
        return (
          <div className="card" key={b.id}>
            <div className="row spread small">
              <span>
                <Link href={`/t/s/${b.slot.id}`}><strong>{formatDate(b.slot.date)} {formatHour(b.slot.hour)}</strong></Link>
                {" · "}{b.slot.therapist?.name ?? "χωρίς θεραπευτή"}
                {b.slot.kind === "PAIR" && <> · <span className="badge">Therapair{partner && ` με ${partner}`}</span></>}
              </span>
              <span>
                {!past ? <span className="badge">προγραμματισμένη</span> : b.joinedAt ? <span className="badge ok">μπήκε</span> : <span className="badge yellow">δεν μπήκε</span>}
                {b.durationMinutes != null && <span className="muted"> · {b.durationMinutes}′</span>}
              </span>
            </div>
            {b.slot.note ? (
              <div className="body-text" style={{ marginTop: 8 }}>
                {dec(b.slot.note.content)}
                <div className="muted small">— {b.slot.note.therapist.name}</div>
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
