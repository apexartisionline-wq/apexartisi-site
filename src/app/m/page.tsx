import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cycleInfo, isPublished, journalDate } from "@/lib/member";
import { bookingWindow, groupJoinable, isAfter, programDay, sessionJoinable } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatTime, localParts } from "@/lib/time";

export default async function MemberHome() {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now);
  const window = bookingWindow(now, s);

  const [cycle, contents, upcoming, journal, attended] = await Promise.all([
    cycleInfo(user.id),
    prisma.content.findMany({ where: { date: today.date }, orderBy: { title: "asc" } }),
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.sessionMinutes * 60_000) } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
      take: 4,
    }),
    prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date: journalDate(now, s) } } }),
    prisma.attendance.findUnique({ where: { memberId_date: { memberId: user.id, date: today.date } } }),
  ]);

  const day = programDay(user.programStartDate, today.date);
  const text = contents.find((c) => c.kind === "DAILY_TEXT" && isPublished(c.date, s.dailyTextTime, now));
  const forms = contents.filter((c) => c.kind === "FORM" && isPublished(c.date, s.formsTime, now));
  const groupToday = s.groupDays.includes(today.weekday);
  const journalOpen = isAfter(now, s.journalTime) || !journal;

  return (
    <main>
      <h1>Γεια σου, {user.name.split(" ")[0]}</h1>

      <section className="card whereami" aria-label="Πού βρίσκομαι">
        <div>
          <span className="muted small">Μέρα του προγράμματος</span>
          <strong>{day ?? "—"}</strong>
        </div>
        <div>
          <span className="muted small">Συνεδρίες στον κύκλο</span>
          <strong>{cycle ? `${cycle.done} από ${cycle.length}` : "—"}</strong>
        </div>
      </section>

      {upcoming.map((b) => {
        const joinable = sessionJoinable(b.slot.startsAt, now, s);
        return (
          <section className="card" key={b.id}>
            <div className="row spread">
              <div>
                <strong>Η συνεδρία σου</strong>
                <div className="muted">
                  {formatDate(b.slot.date)} στις {formatHour(b.slot.hour)}
                  {cycle?.numbers.get(b.id) && ` · συνεδρία ${cycle.numbers.get(b.id)} από ${cycle.length}`}
                </div>
              </div>
              <form action={`/m/join/${b.id}`} method="post">
                <button className="primary" disabled={!joinable}>Μπες στη συνεδρία σου</button>
              </form>
            </div>
            {!joinable && <p className="muted small">Το κουμπί ανοίγει {s.sessionJoinBeforeMinutes} λεπτά πριν.</p>}
          </section>
        );
      })}

      {window.open && (
        <section className="card">
          <strong>Κράτηση ατομικών</strong>
          <p className="muted">Κλείσε τα ραντεβού της εβδομάδας μέχρι τις {formatTime(window.closesAt)}.</p>
          <Link className="btn primary" href="/m/book">Κλείσε ραντεβού</Link>
        </section>
      )}

      <section className="card">
        <strong>Το κείμενο της ημέρας</strong>
        {text ? (
          <p><Link href={`/m/texts/${text.id}`}>{text.title}</Link></p>
        ) : (
          <p className="muted">Έρχεται στις {s.dailyTextTime}.</p>
        )}
      </section>

      {(s.formsDays.includes(today.weekday) || forms.length > 0) && (
        <section className="card">
          <strong>Φόρμες της θεματικής</strong>
          {forms.length ? (
            <ul>
              {forms.map((f) => (
                <li key={f.id}><Link href={`/m/texts/${f.id}`}>{f.title}</Link></li>
              ))}
            </ul>
          ) : (
            <p className="muted">Έρχονται στις {s.formsTime}.</p>
          )}
        </section>
      )}

      {groupToday && (
        <section className="card">
          <div className="row spread">
            <div>
              <strong>Ομάδα</strong>
              <div className="muted">Σήμερα στις {s.groupTime}{attended && " · μπήκες ✓"}</div>
            </div>
            <form action="/m/join/group" method="post">
              <button className="primary" disabled={!groupJoinable(now, s)}>Μπες στην ομάδα</button>
            </form>
          </div>
        </section>
      )}

      <section className="card">
        <strong>Ημερολόγιο ανάκαμψης</strong>
        {journal ? (
          <p className="muted">Το συμπλήρωσες ✓ <Link href="/m/journal">Άλλαξέ το</Link></p>
        ) : journalOpen ? (
          <p><Link className="btn primary" href="/m/journal">Συμπλήρωσέ το</Link></p>
        ) : (
          <p className="muted">Ανοίγει στις {s.journalTime}.</p>
        )}
      </section>
    </main>
  );
}
