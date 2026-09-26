import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

export default async function AdminToday() {
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;

  const [todays, missed, help, cycles, attendance, members, unassigned] = await Promise.all([
    prisma.booking.findMany({
      where: { slot: { date: today } },
      include: { slot: { include: { therapist: { select: { name: true } } } }, member: { select: { name: true } }, note: { select: { id: true } } },
      orderBy: [{ slot: { hour: "asc" } }, { slot: { position: "asc" } }],
    }),
    prisma.booking.findMany({
      where: { joinedAt: null, slot: { date: { gte: addDays(today, -7) }, startsAt: { lt: new Date(now.getTime() - s.sessionMinutes * 60_000) } } },
      include: { slot: true, member: { select: { name: true } } },
      orderBy: { slot: { startsAt: "desc" } },
    }),
    prisma.helpRequest.findMany({
      where: { resolvedAt: null, createdAt: { gte: addDaysDate(now, -1) } },
      include: { member: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cycle.findMany({
      where: { closedAt: null, member: { active: true } },
      include: { member: { select: { id: true, name: true } }, _count: { select: { bookings: true } } },
    }),
    prisma.attendance.count({ where: { date: today } }),
    prisma.user.count({ where: { role: "MEMBER", active: true } }),
    prisma.slot.count({ where: { date: { gte: today, lte: addDays(today, 7) }, therapistId: null } }),
  ]);
  const ending = cycles.filter((c) => c.length - c._count.bookings <= 1).sort((a, b) => b._count.bookings - a._count.bookings);

  return (
    <>
      <h1>{formatDate(today)}</h1>

      {help.length > 0 && (
        <section className="card" style={{ borderColor: "var(--red)" }}>
          <strong>Κόκκινο κουμπί — τελευταίο 24ωρο</strong>
          <ul>
            {help.map((h) => (
              <li key={h.id}>
                {h.member.name} · {h.createdAt.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })} ·{" "}
                {h.claimedByName ? <span className="badge ok">το ανέλαβε ο/η {h.claimedByName}</span> : <span className="badge red">δεν το ανέλαβε κανείς</span>}
              </li>
            ))}
          </ul>
          <Link href="/admin/help">Όλα</Link>
        </section>
      )}

      {unassigned > 0 && (
        <div className="notice">
          {unassigned} θέσεις τις επόμενες 7 μέρες δεν έχουν θεραπευτή — χωρίς αυτόν δεν δουλεύουν το δωμάτιο και τα σημειώματα.{" "}
          <Link href="/admin/slots">Θέσεις</Link>
        </div>
      )}

      <div className="grid2">
        <div className="card"><span className="muted small">Ενεργά μέλη</span><div><strong>{members}</strong></div></div>
        <div className="card"><span className="muted small">Παρουσίες ομάδας σήμερα</span><div><strong>{attendance}</strong></div></div>
        <div className="card"><span className="muted small">Ατομικές σήμερα</span><div><strong>{todays.length}</strong></div></div>
      </div>

      <h2>Ατομικές σήμερα</h2>
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Ώρα</th><th>Δωμ.</th><th>Μέλος</th><th>Θεραπευτής</th><th>Μπήκε</th><th>Σημείωμα</th></tr></thead>
          <tbody>
            {todays.map((b) => (
              <tr key={b.id}>
                <td>{formatHour(b.slot.hour)}</td>
                <td>{b.slot.position}</td>
                <td>{b.member.name}</td>
                <td>{b.slot.therapist?.name ?? <span className="badge red">κανείς</span>}</td>
                <td>{b.joinedAt ? "✓" : "—"}</td>
                <td>{b.note ? "✓" : "—"}</td>
              </tr>
            ))}
            {todays.length === 0 && <tr><td colSpan={6} className="muted">Κανένα ραντεβού.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Δεν μπήκαν (τελευταίες 7 μέρες)</h2>
      <div className="card">
        {missed.length === 0 ? <span className="muted">Κανείς.</span> : (
          <ul>
            {missed.map((b) => (
              <li key={b.id}>{b.member.name} · {formatDate(b.slot.date)} {formatHour(b.slot.hour)}</li>
            ))}
          </ul>
        )}
        <p className="muted small">«Μπήκε» σημαίνει ότι πάτησε το κουμπί του app. Η διάρκεια από τις αναφορές του Zoom εμφανίζεται στα Ραντεβού.</p>
      </div>

      <h2>Κύκλοι που λήγουν</h2>
      <div className="card">
        {ending.length === 0 ? <span className="muted">Κανένας.</span> : (
          <ul>
            {ending.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/people/${c.member.id}`}>{c.member.name}</Link> · {c._count.bookings} από {c.length}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function addDaysDate(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
