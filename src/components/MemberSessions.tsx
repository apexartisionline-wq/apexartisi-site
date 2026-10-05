import Link from "next/link";
import { NoteText } from "./NoteText";
import { NoteTags } from "@/components/NoteTags";
import { dec } from "@/lib/crypto";
import { hideOther, nameVariants } from "@/lib/pair-note";
import { vocative } from "@/lib/vocative";
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
          bookings: { where: { memberId: { not: memberId } }, select: { member: { select: { name: true } } } },
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
        // Therapair: δεύτερη δικλίδα — το όνομα του άλλου δεν φαίνεται ποτέ εδώ.
        const other = b.slot.kind === "PAIR" ? b.slot.bookings.flatMap((o) => nameVariants(o.member.name, vocative)) : [];
        const show = (t: string) => (other.length ? hideOther(t, other) : t);
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
              // Κλειστό, σε μία γραμμή (λιγότερο σκρολάρισμα στο κινητό)· ανοίγει με πάτημα.
              <details className="note-fold">
                <summary>{preview(show(dec(note.content)))} <span className="muted small">— {note.therapist.name}</span></summary>
                <NoteText text={show(dec(note.content))} style={{ marginTop: 8 }} />
                <NoteTags riskChange={note.riskChange} usedSince={note.usedSince} nextStep={show(dec(note.nextStep))} text={show(dec(note.content))} />
              </details>
            ) : (
              past && <div className="muted small" style={{ marginTop: 8 }}>Χωρίς σημείωμα.</div>
            )}
          </div>
        );
      })}
    </>
  );
}

// Μία γραμμή για το κλειστό σημείωμα: «Τι έφερε» αν υπάρχει, αλλιώς η πρώτη γραμμή με περιεχόμενο.
function preview(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("Therapair ("));
  const line = lines.find((l) => l.startsWith("Τι έφερε:")) ?? lines.find((l) => l.startsWith("Τι εμφανίστηκε:")) ?? lines[0] ?? "";
  return line.length > 110 ? `${line.slice(0, 110)}…` : line;
}
