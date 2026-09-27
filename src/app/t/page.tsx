import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { groupDays } from "@/lib/groups";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

async function careDone(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  await prisma.careTask.update({
    where: { id: String(formData.get("id")) },
    data: { doneAt: new Date(), doneById: user.id, note: String(formData.get("note") ?? "").slice(0, 500) },
  });
  redirect("/t");
}

const CARE = { caring_24h: "Μήνυμα φροντίδας (24 ώρες μετά από κρίση)", caring_7d: "Μήνυμα φροντίδας (7 μέρες μετά από κρίση)", dropout: "Απώλεια επαφής — τηλεφώνημα" } as Record<string, string>;

export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : localParts(new Date()).date;
  const s = await getSettings();

  const [care, slots, week, groups] = await Promise.all([
    prisma.careTask.findMany({ where: { doneAt: null, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" } }),
    prisma.slot.findMany({
      where: { date, therapistId: user.id },
      include: { bookings: { include: { member: { select: { id: true, name: true } } } }, note: { select: { id: true } } },
      orderBy: [{ hour: "asc" }, { position: "asc" }],
    }),
    prisma.slot.findMany({
      where: { therapistId: user.id, date: { gt: date, lte: addDays(date, 7) }, bookings: { some: {} } },
      include: { bookings: { include: { member: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { hour: "asc" }],
    }),
    groupDays(date, addDays(date, 7), s),
  ]);
  const myGroups = groups.filter((g) => g.coordinatorId === user.id);
  const careMembers = new Map(
    (await prisma.user.findMany({ where: { id: { in: care.map((c) => c.memberId) } }, select: { id: true, name: true, phone: true } })).map((m) => [m.id, m]),
  );
  const todayGroups = myGroups.filter((g) => g.date === date);
  const names = (x: { bookings: { member: { name: string } }[] }) => x.bookings.map((b) => b.member.name).join(" & ");

  return (
    <main>
      <div className="row spread">
        <Link href={`/t?date=${addDays(date, -1)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>{formatDate(date)}</h1>
        <Link href={`/t?date=${addDays(date, 1)}`}>επόμενη →</Link>
      </div>

      {care.length > 0 && (
        <section className="card" style={{ borderColor: "var(--yellow)" }}>
          <strong>Για όποιον το δει πρώτος</strong>
          {care.map((c) => {
            const m = careMembers.get(c.memberId);
            return (
              <form key={c.id} action={careDone} className="row spread" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={c.id} />
                <span>
                  {CARE[c.kind] ?? c.kind}: <Link href={`/t/members/${c.memberId}`}>{m?.name}</Link>
                  {m?.phone && <> · <a href={`tel:${m.phone}`}>{m.phone}</a></>}
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <input name="note" placeholder="σύντομα: τι έγινε" style={{ width: 180 }} />
                  <button type="submit" style={{ padding: "6px 10px" }}>Έγινε</button>
                </span>
              </form>
            );
          })}
        </section>
      )}

      {todayGroups.map((g) => (
        <section className="card" key={g.time} style={{ borderColor: "var(--accent)" }}>
          <div className="row spread">
            <div>
              <strong>Συντονίζεις την ομάδα στις {g.time}</strong>
              <div className="muted small">{g.hasNote ? "Σημείωμα ομάδας ✓" : "Μετά την ομάδα: σύντομο σημείωμα (2 λεπτά)"}</div>
            </div>
            <div className="row">
              {s.groupRoomUrl && <a className="btn" href={s.groupRoomUrl} target="_blank" rel="noopener noreferrer">Δωμάτιο</a>}
              <Link className="btn primary" href={`/t/group/${g.date}/${g.time.replace(":", "")}`}>Σημείωμα ομάδας</Link>
            </div>
          </div>
        </section>
      ))}

      {slots.length === 0 && todayGroups.length === 0 && <p className="muted">Δεν έχεις ώρες αυτή τη μέρα.</p>}
      {slots.map((x) => (
        <section className="card" key={x.id}>
          <div className="row spread">
            <div>
              <strong>{formatHour(x.hour)}</strong> <span className="muted">· δωμάτιο {x.position}</span>{" "}
              {x.kind === "PAIR" && <span className="badge">Therapair</span>}
              <div>
                {x.bookings.length ? (
                  x.bookings.map((b, i) => (
                    <span key={b.id}>{i > 0 && " & "}<Link href={`/t/members/${b.member.id}`}>{b.member.name}</Link></span>
                  ))
                ) : (
                  <span className="muted">ελεύθερη</span>
                )}
              </div>
            </div>
            <div className="row">
              {s.rooms[x.position - 1] && (
                <a className="btn" href={s.rooms[x.position - 1]} target="_blank" rel="noopener noreferrer">Δωμάτιο</a>
              )}
              {x.bookings.length > 0 && (
                <Link className="btn primary" href={`/t/s/${x.id}`}>{x.note ? "Σημείωμα ✓" : "Σημείωμα"}</Link>
              )}
            </div>
          </div>
        </section>
      ))}

      <h2>Τις επόμενες 7 μέρες</h2>
      <div className="card">
        {week.length === 0 && myGroups.filter((g) => g.date > date).length === 0 ? <span className="muted">Τίποτα.</span> : (
          <ul>
            {myGroups.filter((g) => g.date > date).map((g) => (
              <li key={`${g.date}${g.time}`}><Link href={`/t?date=${g.date}`}>{formatDate(g.date)} {g.time}</Link> · συντονισμός ομάδας</li>
            ))}
            {week.map((x) => (
              <li key={x.id}>
                <Link href={`/t?date=${x.date}`}>{formatDate(x.date)} {formatHour(x.hour)}</Link> · {names(x)}
                {x.kind === "PAIR" && " (Therapair)"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
