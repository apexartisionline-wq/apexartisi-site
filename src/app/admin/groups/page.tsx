import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureGroupSession, groupDays } from "@/lib/groups";
import { keepHistory } from "@/lib/history";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatTime, localParts, mondayOf } from "@/lib/time";

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

// Ακύρωση / επαναφορά μίας ομάδας (π.χ. αργία): η ακυρωμένη ομάδα δεν μπαίνει στον παρονομαστή κανενός μέλους
// και το μέλος δεν βλέπει «Μπες». Η προηγούμενη κατάσταση κρατιέται στο ιστορικό (ποιος, πότε, λόγος).
async function setCancelled(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const date = String(formData.get("date"));
  const time = String(formData.get("time"));
  const cancel = formData.get("cancel") === "1";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  const row = await ensureGroupSession(date, time);
  if (cancel && !reason) redirect(`/admin/groups?week=${formData.get("week")}&err=${encodeURIComponent("Γράψε σύντομα τον λόγο της ακύρωσης.")}`);
  await prisma.$transaction([
    keepHistory("group_cancelled", { ref: row.id, before: { cancelledAt: row.cancelledAt, cancelledById: row.cancelledById, cancelReason: row.cancelReason }, byId: user.id }),
    prisma.groupSession.update({ where: { id: row.id }, data: cancel ? { cancelledAt: new Date(), cancelledById: user.id, cancelReason: reason } : { cancelledAt: null, cancelledById: null, cancelReason: "" } }),
  ]);
  redirect(`/admin/groups?week=${formData.get("week")}&ok=1`);
}

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ week?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : localParts(new Date()).date);
  const s = await getSettings();
  const [days, staff, attendance, cancelledRows] = await Promise.all([
    groupDays(week, addDays(week, 13), s),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.attendance.groupBy({ by: ["date"], where: { date: { gte: week, lte: addDays(week, 13) } }, _count: true }),
    prisma.groupSession.findMany({ where: { date: { gte: week, lte: addDays(week, 13) }, cancelledAt: { not: null } }, select: { date: true, time: true, cancelledAt: true, cancelledById: true } }),
  ]);
  const cancelInfo = new Map(cancelledRows.map((r) => [`${r.date} ${r.time}`, r]));
  const allStaff = new Map((await prisma.user.findMany({ where: { id: { in: cancelledRows.map((r) => r.cancelledById ?? "") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
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
      {sp.err && <div className="error">{sp.err}</div>}
      <p className="muted small">Ο συντονιστής βγαίνει από τη σταθερή εναλλαγή (Ρυθμίσεις). Εδώ τον αλλάζετε για μία μόνο ομάδα.</p>
      <p className="muted small">
        Οι ομάδες εδώ είναι το πραγματικό πρόγραμμα: κάθε ομάδα που έληξε μπαίνει στον παρονομαστή των μελών (μετά την ένταξή τους), ακόμη κι αν δεν
        καταγράφηκε παρουσία. Αν μια ομάδα <strong>δεν έγινε</strong> (π.χ. αργία), πάτα «Ακύρωση» με τον λόγο: δεν μετράει για κανέναν και τα μέλη δεν βλέπουν «Μπες».
      </p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Μέρα</th><th>Ώρα</th><th>Συντονιστής</th><th>Μπήκαν</th><th>Σημείωμα</th><th>Κατάσταση</th></tr></thead>
          <tbody>
            {days.map((g) => (
              <tr key={`${g.date}${g.time}`} style={g.cancelled ? { opacity: 0.75 } : undefined}>
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
                <td>
                  {g.cancelled ? (
                    <form action={setCancelled} className="stack" style={{ gap: 4 }}>
                      <span><span className="badge yellow">Ακυρώθηκε</span> <span className="small">{g.cancelReason}</span></span>
                      {(() => { const c = cancelInfo.get(`${g.date} ${g.time}`); return c?.cancelledAt ? <span className="muted small">{allStaff.get(c.cancelledById ?? "") ?? "—"} · {formatDate(localParts(c.cancelledAt).date)} {formatTime(c.cancelledAt)}</span> : null; })()}
                      <input type="hidden" name="date" value={g.date} />
                      <input type="hidden" name="time" value={g.time} />
                      <input type="hidden" name="week" value={week} />
                      <button type="submit" className="outline" style={{ padding: "4px 8px" }}>Επαναφορά</button>
                    </form>
                  ) : (
                    <form action={setCancelled} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <input type="hidden" name="date" value={g.date} />
                      <input type="hidden" name="time" value={g.time} />
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="cancel" value="1" />
                      <input name="reason" placeholder="λόγος (π.χ. αργία)" aria-label="Λόγος ακύρωσης" style={{ maxWidth: 160 }} maxLength={300} />
                      <button type="submit" className="outline" style={{ padding: "6px 8px" }}>Ακύρωση</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
