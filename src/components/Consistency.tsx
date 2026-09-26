import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAfter } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { addDays, daysBetween, formatDate, localParts, weekdayOf } from "@/lib/time";

// Η Εύα μπορεί να διορθώσει μια παρουσία (π.χ. μπήκε στην ομάδα χωρίς το κουμπί του app).
async function toggleAttendance(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const date = String(formData.get("date"));
  const existing = await prisma.attendance.findUnique({ where: { memberId_date: { memberId, date } } });
  if (existing) await prisma.attendance.delete({ where: { id: existing.id } });
  else await prisma.attendance.create({ data: { memberId, date } });
  revalidatePath("/admin/consistency");
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 100));

function Rate({ done, total }: { done: number; total: number }) {
  const p = pct(done, total);
  if (p === null) return <span className="muted">—</span>;
  return (
    <span>
      {done}/{total} {p < 60 ? <span className="badge yellow">{p}%</span> : <span className="muted">({p}%)</span>}
    </span>
  );
}

export async function Consistency({ weeks, basePath, canEdit }: { weeks: number; basePath: string; canEdit: boolean }) {
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const from = addDays(today, -7 * weeks + 1);

  // Μέρες ομάδας στο διάστημα· η σημερινή μετράει μόνο αφού ξεκινήσει η ομάδα.
  const groupDates: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (!s.groupDays.includes(weekdayOf(d))) continue;
    if (d === today && !isAfter(now, s.groupTime)) continue;
    groupDates.push(d);
  }

  const members = await prisma.user.findMany({
    where: { role: "MEMBER", active: true },
    orderBy: { name: "asc" },
    include: {
      attendances: { where: { date: { gte: from } } },
      bookings: { where: { slot: { date: { gte: from }, startsAt: { lt: now } } }, select: { joinedAt: true } },
      journal: { where: { date: { gte: from } }, select: { date: true } },
    },
  });

  const rows = members.map((m) => {
    const start = m.programStartDate && m.programStartDate > from ? m.programStartDate : from;
    const dates = groupDates.filter((d) => d >= start);
    const present = new Set(m.attendances.map((a) => a.date));
    const groups = dates.filter((d) => present.has(d)).length;
    const journalDays = Math.max(0, daysBetween(start, today) + 1);
    return {
      m,
      dates,
      present,
      groups,
      sessionsDone: m.bookings.filter((b) => b.joinedAt).length,
      sessionsTotal: m.bookings.length,
      journal: m.journal.length,
      journalDays,
      score: pct(groups, dates.length) ?? 101,
    };
  });
  rows.sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name));

  return (
    <>
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Συνέπεια</h1>
        <div className="row">
          {[2, 4, 8].map((w) => (
            <Link key={w} href={`${basePath}?weeks=${w}`} className={`btn${w === weeks ? " primary" : ""}`}>
              {w} εβδομάδες
            </Link>
          ))}
        </div>
      </div>
      <p className="muted small">
        Από {formatDate(from)} έως σήμερα. Πρώτα όσοι έχουν τη χαμηλότερη παρουσία στις ομάδες. Ομάδα = πάτησε «Μπες στην ομάδα».
        Ατομικές = πάτησε «Μπες στη συνεδρία σου». Μετράνε μόνο οι μέρες μετά την έναρξη του προγράμματος του μέλους.
        {canEdit && " Πάτα ένα κουτάκι για να διορθώσεις μια παρουσία."}
      </p>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Μέλος</th>
              <th>Ομάδες</th>
              <th>Ατομικές</th>
              <th>Ημερολόγιο</th>
              {groupDates.map((d) => (
                <th key={d} className="small" style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                  {formatDate(d).split(" ")[0].slice(0, 2)}<br />{d.slice(8)}/{Number(d.slice(5, 7))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {canEdit ? <Link href={`/admin/people/${r.m.id}`}>{r.m.name}</Link> : r.m.name}
                </td>
                <td style={{ whiteSpace: "nowrap" }}><Rate done={r.groups} total={r.dates.length} /></td>
                <td style={{ whiteSpace: "nowrap" }}><Rate done={r.sessionsDone} total={r.sessionsTotal} /></td>
                <td style={{ whiteSpace: "nowrap" }}><Rate done={r.journal} total={r.journalDays} /></td>
                {groupDates.map((d) => {
                  if (!r.dates.includes(d)) return <td key={d} />;
                  const here = r.present.has(d);
                  const mark = here ? "✓" : "·";
                  return (
                    <td key={d} style={{ textAlign: "center" }}>
                      {canEdit ? (
                        <form action={toggleAttendance}>
                          <input type="hidden" name="memberId" value={r.m.id} />
                          <input type="hidden" name="date" value={d} />
                          <button type="submit" title={here ? "Αφαίρεση παρουσίας" : "Προσθήκη παρουσίας"} style={{ padding: "2px 8px" }}>
                            {mark}
                          </button>
                        </form>
                      ) : (
                        <span style={{ color: here ? "var(--ok)" : "var(--muted)" }}>{mark}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">Δεν υπάρχουν ενεργά μέλη.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function parseWeeks(v: string | undefined): number {
  const n = Number(v);
  return [2, 4, 8].includes(n) ? n : 4;
}
