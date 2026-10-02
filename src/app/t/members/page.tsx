import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { programDay } from "@/lib/program";
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

// Συνολική εικόνα της ομάδας για όλους τους θεραπευτές (όλοι δουλεύουν με όλους).
export default async function MembersOverview() {
  await requireRole("THERAPIST", "ADMIN");
  const now = new Date();
  const today = localParts(now).date;
  const from = addDays(today, -27);
  const members = await prisma.user.findMany({
    where: { role: "MEMBER", active: true },
    orderBy: { name: "asc" },
    include: {
      cycles: { where: { closedAt: null }, include: { bookings: { include: { slot: true } } } },
      _count: { select: { attendances: { where: { date: { gte: from } } } } },
      bookings: {
        include: { slot: { include: { therapist: { select: { name: true } }, note: { select: { id: true } } } } },
        orderBy: { slot: { startsAt: "desc" } },
        take: 20,
      },
    },
  });

  return (
    <main className="wide">
      <h1>Μέλη</h1>
      <p className="muted small">Όλα τα ενεργά μέλη. Πάτα ένα όνομα για το ιστορικό των ατομικών και τα σημειώματα.</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Μέλος</th><th>Μέρα</th><th>Κύκλος</th><th>Ομάδες (4 εβδ.)</th><th>Τελευταία ατομική</th><th>Επόμενη ατομική</th></tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const cycle = m.cycles[0];
              const done = cycle?.bookings.filter((b) => b.slot.startsAt <= now).length ?? 0;
              const last = m.bookings.find((b) => b.slot.startsAt <= now);
              const next = [...m.bookings].reverse().find((b) => b.slot.startsAt > now);
              return (
                <tr key={m.id}>
                  <td><Link href={`/t/members/${m.id}`}>{m.name}</Link></td>
                  <td>{programDay(m.programStartDate, today) ?? "—"}</td>
                  <td>{cycle ? `${done} από ${cycle.length}` : "—"}</td>
                  <td>{m._count.attendances}</td>
                  <td className="small">
                    {last ? (
                      <>
                        {formatDate(last.slot.date)} · {last.slot.therapist?.name ?? "—"}{" "}
                        {!last.joinedAt && <span className="badge yellow">δεν μπήκε</span>}
                        {last.joinedAt && !last.slot.note && <span className="badge">χωρίς σημείωμα</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td className="small">
                    {next ? `${formatDate(next.slot.date)} ${formatHour(next.slot.hour)} · ${next.slot.therapist?.name ?? "—"}` : "—"}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && <tr><td colSpan={6} className="muted">Δεν υπάρχουν ενεργά μέλη.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
