import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionNumber } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : localParts(new Date()).date;
  const s = await getSettings();

  const slots = await prisma.slot.findMany({
    where: { date, therapistId: user.id },
    include: { booking: { include: { member: { select: { name: true } }, note: { select: { id: true } } } } },
    orderBy: [{ hour: "asc" }, { position: "asc" }],
  });
  const week = await prisma.slot.findMany({
    where: { therapistId: user.id, date: { gt: date, lte: addDays(date, 7) }, booking: { isNot: null } },
    include: { booking: { include: { member: { select: { name: true } } } } },
    orderBy: [{ date: "asc" }, { hour: "asc" }],
  });
  const numbers = await Promise.all(
    slots.map((x) => (x.booking ? sessionNumber({ cycleId: x.booking.cycleId, slot: x }) : null)),
  );

  return (
    <main>
      <div className="row spread">
        <Link href={`/t?date=${addDays(date, -1)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>{formatDate(date)}</h1>
        <Link href={`/t?date=${addDays(date, 1)}`}>επόμενη →</Link>
      </div>
      {slots.length === 0 && <p className="muted">Δεν έχεις ώρες αυτή τη μέρα.</p>}
      {slots.map((x, i) => (
        <section className="card" key={x.id}>
          <div className="row spread">
            <div>
              <strong>{formatHour(x.hour)}</strong> <span className="muted">· δωμάτιο {x.position}</span>
              <div>
                {x.booking ? (
                  <>
                    <Link href={`/t/members/${x.booking.memberId}`}>{x.booking.member.name}</Link> <span className="muted">{numbers[i] && `· ${numbers[i]}`}</span>
                  </>
                ) : (
                  <span className="muted">ελεύθερη</span>
                )}
              </div>
            </div>
            <div className="row">
              {s.rooms[x.position - 1] && (
                <a className="btn" href={s.rooms[x.position - 1]} target="_blank" rel="noopener noreferrer">Δωμάτιο</a>
              )}
              {x.booking && (
                <Link className="btn primary" href={`/t/b/${x.booking.id}`}>
                  {x.booking.note ? "Σημείωμα ✓" : "Σημείωμα"}
                </Link>
              )}
            </div>
          </div>
        </section>
      ))}

      <h2>Τις επόμενες 7 μέρες</h2>
      <div className="card">
        {week.length === 0 ? <span className="muted">Κανένα ραντεβού.</span> : (
          <ul>
            {week.map((x) => (
              <li key={x.id}>
                <Link href={`/t?date=${x.date}`}>{formatDate(x.date)} {formatHour(x.hour)}</Link> · {x.booking?.member.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
