import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cycleForNewBooking } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, localParts, mondayOf } from "@/lib/time";

const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function cancel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.booking.delete({ where: { id } });
  redirect(`/admin/bookings?week=${formData.get("week")}&ok=1`);
}

async function setDuration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const raw = String(formData.get("minutes") ?? "").trim();
  const minutes = raw === "" ? null : Math.max(0, Math.min(600, Math.round(Number(raw))));
  await prisma.booking.update({ where: { id: String(formData.get("id")) }, data: { durationMinutes: minutes } });
  redirect(`/admin/bookings?week=${formData.get("week")}`);
}

// Η Εύα μπορεί να κλείσει ραντεβού για λογαριασμό μέλους, εκτός του παραθύρου της Δευτέρας.
async function bookFor(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const s = await getSettings();
  const memberId = String(formData.get("memberId"));
  const date = String(formData.get("date"));
  const hour = Number(formData.get("hour"));
  const week = String(formData.get("week"));
  const free = await prisma.slot.findMany({
    where: { date, hour, therapistId: { not: null }, booking: null },
    orderBy: { position: "asc" },
  });
  for (const slot of free) {
    try {
      const cycleId = await cycleForNewBooking(memberId, s);
      await prisma.booking.create({ data: { slotId: slot.id, memberId, cycleId } });
      redirect(`/admin/bookings?week=${week}&ok=1`);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  redirect(`/admin/bookings?week=${week}&e=${encodeURIComponent("Δεν υπάρχει ελεύθερη θέση με θεραπευτή εκείνη την ώρα.")}`);
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ week?: string; ok?: string; e?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(isDate(sp.week) ? sp.week : localParts(new Date()).date);
  const end = addDays(week, 6);
  const [bookings, members] = await Promise.all([
    prisma.booking.findMany({
      where: { slot: { date: { gte: week, lte: end } } },
      include: {
        slot: { include: { therapist: { select: { name: true } } } },
        member: { select: { id: true, name: true } },
        note: { select: { id: true } },
      },
      orderBy: [{ slot: { startsAt: "asc" } }, { slot: { position: "asc" } }],
    }),
    prisma.user.findMany({ where: { role: "MEMBER", active: true }, orderBy: { name: "asc" } }),
  ]);
  const perMember = new Map<string, number>();
  bookings.forEach((b) => perMember.set(b.member.id, (perMember.get(b.member.id) ?? 0) + 1));
  const now = new Date();
  const without = members.filter((m) => !perMember.has(m.id));

  return (
    <>
      <div className="row spread">
        <Link href={`/admin/bookings?week=${addDays(week, -7)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>Εβδομάδα {formatDate(week)} – {formatDate(end)}</h1>
        <Link href={`/admin/bookings?week=${addDays(week, 7)}`}>επόμενη →</Link>
      </div>
      {sp.ok && <div className="notice">Έγινε ✓</div>}
      {sp.e && <div className="error">{sp.e}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Μέρα</th><th>Ώρα</th><th>Δωμ.</th><th>Μέλος</th><th>Θεραπευτής</th><th>Μπήκε</th><th>Διάρκεια (λ.)</th><th>Σημ.</th><th></th></tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const past = b.slot.startsAt < now;
              return (
                <tr key={b.id}>
                  <td>{formatDate(b.slot.date)}</td>
                  <td>{formatHour(b.slot.hour)}</td>
                  <td>{b.slot.position}</td>
                  <td><Link href={`/admin/people/${b.member.id}`}>{b.member.name}</Link></td>
                  <td>{b.slot.therapist?.name ?? "—"}</td>
                  <td>{b.joinedAt ? "✓" : past ? <span className="badge yellow">όχι</span> : ""}</td>
                  <td>
                    {past && (
                      <form action={setDuration} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="week" value={week} />
                        <input name="minutes" type="number" min={0} defaultValue={b.durationMinutes ?? ""} style={{ width: 80 }} />
                        <button type="submit" style={{ padding: "6px 10px" }}>✓</button>
                      </form>
                    )}
                  </td>
                  <td>{b.note ? <Link href={`/t/b/${b.id}`}>✓</Link> : "—"}</td>
                  <td>
                    {!past && (
                      <form action={cancel}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="week" value={week} />
                        <button type="submit" style={{ padding: "6px 10px" }}>Ακύρωση</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && <tr><td colSpan={9} className="muted">Κανένα ραντεβού.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Χωρίς ραντεβού αυτή την εβδομάδα</h2>
      <div className="card">{without.length ? without.map((m) => m.name).join(", ") : <span className="muted">Κανείς.</span>}</div>

      <h2>Κράτηση για λογαριασμό μέλους</h2>
      <form action={bookFor} className="card grid2">
        <input type="hidden" name="week" value={week} />
        <div className="field">
          <label>Μέλος</label>
          <select name="memberId" required>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Μέρα</label>
          <input name="date" type="date" defaultValue={week} required />
        </div>
        <div className="field">
          <label>Ώρα (0–23)</label>
          <input name="hour" type="number" min={0} max={23} required />
        </div>
        <div className="field" style={{ alignSelf: "end" }}>
          <button className="primary" type="submit">Κλείσε</button>
        </div>
      </form>
    </>
  );
}
