import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

async function settle(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.cycle.update({ where: { id: String(formData.get("id")) }, data: { settledAt: new Date() } });
  redirect("/admin");
}

export default async function AdminToday() {
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [todays, missed, help, unsettled, requests, flags, pairs, attendance, members, unassigned] = await Promise.all([
    prisma.slot.findMany({
      where: { date: today, bookings: { some: {} } },
      include: { therapist: { select: { name: true } }, bookings: { include: { member: { select: { name: true } } } }, note: { select: { id: true } } },
      orderBy: [{ hour: "asc" }, { position: "asc" }],
    }),
    prisma.booking.findMany({
      where: { joinedAt: null, slot: { date: { gte: addDays(today, -7) }, startsAt: { lt: new Date(now.getTime() - s.sessionMinutes * 60_000) } } },
      include: { slot: true, member: { select: { name: true } } },
      orderBy: { slot: { startsAt: "desc" } },
    }),
    prisma.helpRequest.findMany({ where: { resolvedAt: null, createdAt: { gte: dayAgo } }, include: { member: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.cycle.findMany({ where: { settledAt: null, member: { active: true } }, include: { member: { select: { id: true, name: true } } }, orderBy: { startedAt: "asc" } }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
    prisma.booking.count({ where: { alternationOk: false, slot: { startsAt: { gt: now } } } }),
    prisma.slot.count({ where: { kind: "PAIR", pairApprovedAt: null, startsAt: { gt: now }, bookings: { some: {} } } }),
    prisma.attendance.count({ where: { date: today } }),
    prisma.user.count({ where: { role: "MEMBER", active: true } }),
    prisma.slot.count({ where: { date: { gte: today, lte: addDays(today, 7) }, therapistId: null } }),
  ]);

  const todo = [
    requests && { href: "/admin/requests", text: `${requests} αιτήματα αλλαγής ραντεβού` },
    flags && { href: "/admin/bookings", text: `${flags} ραντεβού θέλουν έλεγχο εναλλαγής βιωματικού/κλινικού` },
    pairs && { href: "/admin/bookings", text: `${pairs} Therapair θέλουν έγκριση ζευγαριού` },
    unassigned && { href: "/admin/slots", text: `${unassigned} θέσεις τις επόμενες 7 μέρες χωρίς θεραπευτή` },
  ].filter(Boolean) as { href: string; text: string }[];

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

      <section className="card">
        <strong>Εκκρεμότητες</strong>
        {todo.length === 0 && unsettled.length === 0 ? (
          <p className="muted">Τίποτα δεν περιμένει ✓</p>
        ) : (
          <ul>
            {todo.map((t) => <li key={t.text}><Link href={t.href}>{t.text}</Link></li>)}
            {unsettled.map((c) => (
              <li key={c.id} className="row" style={{ gap: 8 }}>
                <span>Νέος κύκλος — εκκρεμεί τακτοποίηση: <Link href={`/admin/people/${c.member.id}`}>{c.member.name}</Link> (από {formatDate(localParts(c.startedAt).date)})</span>
                <form action={settle}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" style={{ padding: "4px 10px" }}>Τακτοποιήθηκε</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid2">
        <div className="card"><span className="muted small">Ενεργά μέλη</span><div><strong>{members}</strong></div></div>
        <div className="card"><span className="muted small">Παρουσίες ομάδας σήμερα</span><div><strong>{attendance}</strong></div></div>
        <div className="card"><span className="muted small">Ατομικές/Therapair σήμερα</span><div><strong>{todays.length}</strong></div></div>
      </div>

      <h2>Σήμερα</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Ώρα</th><th>Δωμ.</th><th>Μέλος</th><th>Θεραπευτής</th><th>Μπήκε</th><th>Σημείωμα</th></tr></thead>
          <tbody>
            {todays.map((x) => (
              <tr key={x.id}>
                <td>{formatHour(x.hour)}</td>
                <td>{x.position}</td>
                <td>{x.kind === "PAIR" && "Therapair: "}{x.bookings.map((b) => b.member.name).join(" & ")}</td>
                <td>{x.therapist?.name ?? <span className="badge red">κανείς</span>}</td>
                <td>{x.bookings.map((b) => (b.joinedAt ? "✓" : "—")).join(" ")}</td>
                <td>{x.note ? <Link href={`/t/s/${x.id}`}>✓</Link> : "—"}</td>
              </tr>
            ))}
            {todays.length === 0 && <tr><td colSpan={6} className="muted">Κανένα ραντεβού.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Δεν μπήκαν (τελευταίες 7 μέρες)</h2>
      <div className="card">
        {missed.length === 0 ? <span className="muted">Κανείς.</span> : (
          <ul>{missed.map((b) => <li key={b.id}>{b.member.name} · {formatDate(b.slot.date)} {formatHour(b.slot.hour)}</li>)}</ul>
        )}
        <p className="muted small">«Μπήκε» σημαίνει ότι πάτησε το κουμπί του app.</p>
      </div>
    </>
  );
}
