import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelBooking } from "@/lib/booking";
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

const back = (week: unknown, q: string) => `/admin/groups?week=${encodeURIComponent(String(week ?? ""))}&${q}`;
const err = (week: unknown, msg: string) => redirect(back(week, `err=${encodeURIComponent(msg)}`));

// Αργία (υπεύθυνη 13/10): οι ατομικές της μέρας ακυρώνονται (κάθε ακύρωση κρατιέται στο ιστορικό με ποιος/πότε/λόγο),
// δεν ανοίγουν κρατήσεις εκείνη τη μέρα και, αν δοθεί ώρα, γίνεται ομάδα στη θέση τους. Οι ομάδες δεν ακυρώνονται ποτέ.
async function declareHoliday(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const week = formData.get("week");
  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const groupTime = String(formData.get("groupTime") ?? "").trim();
  const coordinatorId = String(formData.get("coordinatorId") ?? "") || null;
  const today = localParts(new Date()).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) err(week, "Διάλεξε μέρα από σήμερα και μετά.");
  if (!reason) err(week, "Γράψε τον λόγο (π.χ. 28η Οκτωβρίου).");
  if (groupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(groupTime)) err(week, "Η ώρα της ομάδας θέλει μορφή ΩΩ:ΛΛ (π.χ. 18:00).");
  if (groupTime && !coordinatorId) err(week, "Διάλεξε ποιος συντονίζει την ομάδα.");
  if (await prisma.holiday.findUnique({ where: { date } })) err(week, "Η μέρα είναι ήδη αργία.");
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { slot: { date } },
    include: { slot: { select: { id: true, date: true, hour: true, startsAt: true, therapistId: true, kind: true, note: { select: { id: true } }, pairNotes: { select: { id: true } } } } },
  });
  // Ό,τι έχει ήδη ξεκινήσει ή έχει σημείωμα δεν ακυρώνεται από εδώ.
  const started = bookings.filter((b) => b.slot.startsAt <= now || b.joinedAt || b.slot.note || b.slot.pairNotes.length);
  if (started.length) err(week, `Υπάρχουν ατομικές της μέρας που έχουν ήδη ξεκινήσει ή έχουν σημείωμα (${started.length}). Δεν έγινε καμία αλλαγή.`);
  await prisma.holiday.create({ data: { date, reason, groupTime, createdById: user.id } });
  for (const b of bookings) {
    await keepHistory("booking_cancelled", {
      memberId: b.memberId, ref: b.slot.id,
      before: { reason: `Αργία: ${reason}`, date: b.slot.date, hour: b.slot.hour, startsAt: b.slot.startsAt, therapistId: b.slot.therapistId, kind: b.slot.kind, cycleId: b.cycleId, bookedAt: b.createdAt },
      byId: user.id,
    });
    await cancelBooking(b.id);
  }
  if (groupTime) {
    const row = await ensureGroupSession(date, groupTime);
    await prisma.groupSession.update({ where: { id: row.id }, data: { coordinatorId } });
  }
  redirect(back(week, `ok=holiday&n=${bookings.length}`));
}

// Άρση αργίας (μόνο για μελλοντική μέρα): ξανανοίγουν οι κρατήσεις· οι ατομικές που ακυρώθηκαν ΔΕΝ ξαναμπαίνουν μόνες τους.
// Η έκτακτη ομάδα μένει, εκτός αν δεν είναι στο εβδομαδιαίο πρόγραμμα και δεν έχει σημείωμα.
async function liftHoliday(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const week = formData.get("week");
  const date = String(formData.get("date") ?? "");
  const h = await prisma.holiday.findUnique({ where: { date } });
  if (!h) redirect(back(week, "ok=1"));
  if (date <= localParts(new Date()).date) err(week, "Η άρση γίνεται μόνο για μέρα που δεν έχει έρθει ακόμα.");
  await prisma.$transaction([keepHistory("holiday_removed", { ref: date, before: h, byId: user.id }), prisma.holiday.delete({ where: { date } })]);
  if (h.groupTime) await prisma.groupSession.deleteMany({ where: { date, time: h.groupTime, fromProgramme: false, noteAt: null } });
  redirect(back(week, "ok=1"));
}

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ week?: string; ok?: string; err?: string; n?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : localParts(new Date()).date);
  const s = await getSettings();
  const today = localParts(new Date()).date;
  const [days, staff, attendance, holidays] = await Promise.all([
    groupDays(week, addDays(week, 13), s),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.attendance.groupBy({ by: ["date"], where: { date: { gte: week, lte: addDays(week, 13) } }, _count: true }),
    prisma.holiday.findMany({ where: { date: { gte: addDays(today, -30) } }, orderBy: { date: "asc" } }),
  ]);
  const holidayBy = new Map(holidays.map((h) => [h.date, h]));
  const name = new Map(staff.map((t) => [t.id, t.name]));
  const present = new Map(attendance.map((a) => [a.date, a._count]));
  return (
    <>
      <div className="row spread">
        <Link href={`/admin/groups?week=${addDays(week, -7)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>Ομάδες {formatDate(week)} – {formatDate(addDays(week, 13))}</h1>
        <Link href={`/admin/groups?week=${addDays(week, 7)}`}>επόμενη →</Link>
      </div>
      {sp.ok === "holiday" ? <div className="notice">Η αργία καταχωρίστηκε ✓ Ακυρώθηκαν {sp.n ?? 0} ατομικές (κρατιούνται στο ιστορικό). Ενημερώστε τα μέλη ότι μπορούν να κλείσουν άλλη ώρα.</div> : sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.err && <div className="error">{sp.err}</div>}
      <p className="muted small">Ο συντονιστής βγαίνει από τη σταθερή εναλλαγή (Ρυθμίσεις). Εδώ τον αλλάζετε για μία μόνο ομάδα.</p>
      <p className="muted small">Οι ομάδες εδώ είναι το πραγματικό πρόγραμμα: γίνονται πάντα (δεν ακυρώνονται) και κάθε ομάδα που έληξε μετράει στον παρονομαστή των μελών μετά την ένταξή τους, ακόμη κι αν δεν καταγράφηκε παρουσία.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Μέρα</th><th>Ώρα</th><th>Συντονιστής</th><th>Μπήκαν</th><th>Σημείωμα</th></tr></thead>
          <tbody>
            {days.map((g) => (
              <tr key={`${g.date}${g.time}`}>
                <td>{formatDate(g.date)}{holidayBy.has(g.date) && <> <span className="badge yellow">αργία</span></>}</td>
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

      <h2>Αργία: ατομικές → ομάδα</h2>
      <div className="card stack">
        <p className="muted small" style={{ margin: 0 }}>
          Σε αργία ακυρώνονται οι ατομικές της μέρας (κάθε ακύρωση κρατιέται στο ιστορικό, με ποιος, πότε και λόγο) και δεν ανοίγουν κρατήσεις εκείνη τη μέρα.
          Αν δώσετε ώρα, γίνεται ομάδα στη θέση τους· μετράει κανονικά και τα μέλη τη βλέπουν στο «Σήμερα» με «Μπες». Οι ομάδες δεν ακυρώνονται ποτέ.
          Τα μέλη βλέπουν στο «Σήμερα» τους, μία εβδομάδα πριν: «αργία — δεν γίνονται ατομικές».
        </p>
        <form action={declareHoliday} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <input type="hidden" name="week" value={week} />
          <label className="stack" style={{ gap: 2 }}><span className="small">Μέρα</span><input type="date" name="date" min={today} required /></label>
          <label className="stack" style={{ gap: 2, flex: 1, minWidth: 180 }}><span className="small">Λόγος</span><input name="reason" placeholder="π.χ. 28η Οκτωβρίου" maxLength={200} required /></label>
          <label className="stack" style={{ gap: 2 }}><span className="small">Ομάδα στη θέση τους (προαιρετικό)</span><input type="time" name="groupTime" /></label>
          <label className="stack" style={{ gap: 2 }}><span className="small">Συντονίζει</span>
            <select name="coordinatorId" defaultValue="">
              <option value="">—</option>
              {staff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button type="submit">Καταχώριση αργίας</button>
        </form>
        {holidays.length > 0 && (
          <div className="list">
            {holidays.map((h) => (
              <div key={h.date} className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
                <span><strong>{formatDate(h.date)}</strong> · {h.reason}{h.groupTime ? ` · ομάδα ${h.groupTime}` : " · χωρίς έκτακτη ομάδα"} <span className="muted small">· {name.get(h.createdById) ?? "—"}, {formatDate(localParts(h.createdAt).date)} {formatTime(h.createdAt)}</span></span>
                {h.date > today && (
                  <form action={liftHoliday}>
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="date" value={h.date} />
                    <button type="submit" className="outline sm" title="Ξανανοίγουν οι κρατήσεις· οι ατομικές που ακυρώθηκαν δεν ξαναμπαίνουν μόνες τους">Άρση</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
