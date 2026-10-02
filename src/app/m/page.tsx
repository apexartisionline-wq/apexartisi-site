import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { memberConsents, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { withMemberCode } from "@/lib/forms";
import { cycleInfo, isPublished, journalDate } from "@/lib/member";
import { bookingWindow, canRequestChange, groupsOn, isAfter, joinableGroup, sessionJoinable, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatTime, localParts } from "@/lib/time";

export default async function MemberHome() {
  const user = await requireMember();
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now);
  const window = bookingWindow(now, s);

  const [cycle, contents, upcoming, journal, attended, requests, consents] = await Promise.all([
    cycleInfo(user.id),
    prisma.content.findMany({ where: { date: today.date }, orderBy: { title: "asc" } }),
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.pairMinutes * 60_000) } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
      take: 4,
    }),
    s.journalFormUrl
      ? Promise.resolve(null)
      : prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date: journalDate(now, s) } } }),
    prisma.attendance.findUnique({ where: { memberId_date: { memberId: user.id, date: today.date } } }),
    prisma.changeRequest.findMany({
      where: { memberId: user.id, OR: [{ status: "PENDING" }, { handledAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }] },
      orderBy: { createdAt: "desc" },
    }),
    memberConsents(user.id),
  ]);

  const text = contents.find((c) => c.kind === "DAILY_TEXT" && isPublished(c.date, s.dailyTextTime, now));
  const forms = contents.filter((c) => c.kind === "FORM" && isPublished(c.date, s.formsTime, now));
  const groupsToday = groupsOn(today.date, s);
  const groupOpen = joinableGroup(now, s);
  const journalOpen = isAfter(now, s.journalTime);
  const pendingFor = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.bookingId));
  const fresh = cycle && cycle.cycle.closedAt && cycle.booked >= cycle.length && cycle.done >= cycle.length;

  return (
    <main>
      <h1>Γεια σου, {user.name.split(" ")[0]}</h1>

      <Announcements />

      <section className="card whereami" aria-label="Πού βρίσκομαι">
        <div>
          <span className="muted small">Ατομικές</span>
          <strong>{cycle ? `${Math.min(cycle.done, cycle.length)} από ${cycle.length}` : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Ομάδες</span>
          <strong>{cycle ? `${cycle.groups} από ${s.groupsPerCycle}` : "—"}</strong>
        </div>
      </section>
      {fresh && <p className="muted small">Ο κύκλος σου ολοκληρώθηκε — ο επόμενος ξεκινά με το επόμενο ραντεβού σου.</p>}

      {requests.filter((r) => r.status !== "PENDING").map((r) => (
        <div className="notice" key={r.id}>
          Απάντηση στο αίτημά σου: {r.status === "DONE" ? "έγινε ✓" : "δεν ήταν δυνατό"}{r.reply && ` — ${r.reply}`}
        </div>
      ))}

      {upcoming.map((b) => {
        const minutes = slotMinutes(b.slot.kind, s);
        const joinable = sessionJoinable(b.slot.startsAt, now, s, minutes);
        const canAsk = canRequestChange(b.slot.startsAt, now, s) && !pendingFor.has(b.id);
        return (
          <section className="card" key={b.id}>
            <div className="row spread">
              <div>
                <strong>{b.slot.kind === "PAIR" ? "Το Therapair σου" : "Η συνεδρία σου"}</strong>
                <div className="muted">
                  {formatDate(b.slot.date)} στις {formatHour(b.slot.hour)}
                  {cycle?.numbers.get(b.id) && ` · ατομική ${cycle.numbers.get(b.id)} από ${cycle.length}`}
                </div>
              </div>
              <form action={`/m/join/${b.id}`} method="post">
                <button className="primary" disabled={!joinable}>Μπες στη συνεδρία σου</button>
              </form>
            </div>
            <div className="row spread small" style={{ marginTop: 8 }}>
              <span className="muted">{!joinable && `Το κουμπί ανοίγει ${s.sessionJoinBeforeMinutes} λεπτά πριν.`}</span>
              {pendingFor.has(b.id) ? (
                <span className="badge">αίτημα αλλαγής: σε αναμονή</span>
              ) : canAsk ? (
                <Link href={`/m/request/${b.id}`}>Αίτημα αλλαγής ή ακύρωσης</Link>
              ) : null}
            </div>
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
                <li key={f.id}>
                  {f.url && consents.forms === "YES" ? (
                    <a href={withMemberCode(f.url, user.memberCode)} target="_blank" rel="noopener noreferrer">{f.title}</a>
                  ) : (
                    <Link href={`/m/texts/${f.id}`}>{f.title}</Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Έρχονται στις {s.formsTime}.</p>
          )}
        </section>
      )}

      {groupsToday.length > 0 && (
        <section className="card">
          <div className="row spread">
            <div>
              <strong>Ομάδα</strong>
              <div className="muted">
                Σήμερα στις {groupsToday.map((g) => g.time).join(", ")}
                {attended && " · μπήκες ✓"}
              </div>
            </div>
            <form action="/m/join/group" method="post">
              <button className="primary" disabled={!groupOpen}>Μπες στην ομάδα</button>
            </form>
          </div>
        </section>
      )}

      {consents.journal === "YES" && (
      <section className="card">
        <strong>Ημερολόγιο ανάκαμψης</strong>
        {s.journalFormUrl ? (
          journalOpen ? (
            <p><a className="btn primary" href={withMemberCode(s.journalFormUrl, user.memberCode)} target="_blank" rel="noopener noreferrer">Συμπλήρωσέ το</a></p>
          ) : (
            <p className="muted">Ανοίγει στις {s.journalTime}.</p>
          )
        ) : journal ? (
          <p className="muted">Το συμπλήρωσες ✓ <Link href="/m/journal">Άλλαξέ το</Link></p>
        ) : journalOpen || !journal ? (
          <p><Link className="btn primary" href="/m/journal">Συμπλήρωσέ το</Link></p>
        ) : null}
      </section>
      )}
    </main>
  );
}
