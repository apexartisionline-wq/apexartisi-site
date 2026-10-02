import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureGroupSession, groupDays } from "@/lib/groups";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts, mondayOf } from "@/lib/time";

// Αλλαγή συντονιστή για μία μόνο ομάδα (εκτός απροόπτου)· η σταθερή εναλλαγή μένει στις Ρυθμίσεις.
async function setCoordinator(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const date = String(formData.get("date"));
  const time = String(formData.get("time"));
  const coordinatorId = String(formData.get("coordinatorId")) || null;
  const row = await ensureGroupSession(date, time);
  await prisma.groupSession.update({ where: { id: row.id }, data: { coordinatorId } });
  redirect(`/admin/groups?week=${formData.get("week")}&ok=1`);
}

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ week?: string; ok?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : localParts(new Date()).date);
  const s = await getSettings();
  const [days, staff, attendance] = await Promise.all([
    groupDays(week, addDays(week, 13), s),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.attendance.groupBy({ by: ["date"], where: { date: { gte: week, lte: addDays(week, 13) } }, _count: true }),
  ]);
  const name = new Map(staff.map((t) => [t.id, t.name]));
  const present = new Map(attendance.map((a) => [a.date, a._count]));
  return (
    <>
      <div className="row spread">
        <Link href={`/admin/groups?week=${addDays(week, -7)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>Ομάδες {formatDate(week)} – {formatDate(addDays(week, 13))}</h1>
        <Link href={`/admin/groups?week=${addDays(week, 7)}`}>επόμενη →</Link>
      </div>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      <p className="muted small">Ο συντονιστής βγαίνει από τη σταθερή εναλλαγή (Ρυθμίσεις). Εδώ τον αλλάζετε για μία μόνο ομάδα.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Μέρα</th><th>Ώρα</th><th>Συντονιστής</th><th>Μπήκαν</th><th>Σημείωμα</th></tr></thead>
          <tbody>
            {days.map((g) => (
              <tr key={`${g.date}${g.time}`}>
                <td>{formatDate(g.date)}</td>
                <td>{g.time}</td>
                <td>
                  <form action={setCoordinator} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <input type="hidden" name="date" value={g.date} />
                    <input type="hidden" name="time" value={g.time} />
                    <input type="hidden" name="week" value={week} />
                    <select name="coordinatorId" defaultValue={g.coordinatorId ?? ""} style={{ maxWidth: 200 }}>
                      <option value="">—</option>
                      {staff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="submit" style={{ padding: "6px 8px" }}>✓</button>
                    {g.overridden && <span className="badge yellow">αλλαγή</span>}
                  </form>
                </td>
                <td>{present.get(g.date) ?? 0}</td>
                <td>
                  <Link href={`/t/group/${g.date}/${g.time.replace(":", "")}`}>{g.hasNote ? "✓ Άνοιγμα" : "—"}</Link>
                  {!g.coordinatorId && <span className="badge red">χωρίς συντονιστή</span>}
                  {g.coordinatorId && !name.get(g.coordinatorId) && <span className="badge">ανενεργός</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
