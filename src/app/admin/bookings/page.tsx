import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { bookHour, cancelBooking, moveBooking } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { addDays, formatDate, formatHour, localParts, mondayOf } from "@/lib/time";

const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const back = (week: FormDataEntryValue | null, q: string) => redirect(`/admin/bookings?week=${week}&${q}`);
const kindOf = (v: FormDataEntryValue | null) => (v === "PAIR" ? "PAIR" : "INDIVIDUAL") as "PAIR" | "INDIVIDUAL";

async function cancel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await cancelBooking(String(formData.get("id")));
  back(formData.get("week"), "ok=1");
}

async function move(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const res = await moveBooking(String(formData.get("id")), String(formData.get("date")), Number(formData.get("hour")), kindOf(formData.get("kind")));
  back(formData.get("week"), res.ok ? "ok=1" : `e=${encodeURIComponent(res.reason)}`);
}

async function setDuration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const raw = String(formData.get("minutes") ?? "").trim();
  const minutes = raw === "" ? null : Math.max(0, Math.min(600, Math.round(Number(raw))));
  await prisma.booking.update({ where: { id: String(formData.get("id")) }, data: { durationMinutes: minutes } });
  back(formData.get("week"), "");
}

async function approveAlternation(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.booking.update({ where: { id: String(formData.get("id")) }, data: { alternationOk: true } });
  back(formData.get("week"), "ok=1");
}

async function approvePair(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.slot.update({ where: { id: String(formData.get("slotId")) }, data: { pairApprovedAt: new Date() } });
  back(formData.get("week"), "ok=1");
}

// Therapair χωρίς δεύτερο μέλος → γίνεται ατομική.
async function toIndividual(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("slotId"));
  const n = await prisma.booking.count({ where: { slotId: id } });
  if (n <= 1) await prisma.slot.update({ where: { id }, data: { kind: "INDIVIDUAL", pairApprovedAt: null } });
  back(formData.get("week"), "ok=1");
}

// Η Εύα μπορεί να κλείσει ραντεβού για λογαριασμό μέλους, εκτός του παραθύρου της Δευτέρας.
async function bookFor(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const res = await bookHour({
    memberId: String(formData.get("memberId")),
    date: String(formData.get("date")),
    hour: Number(formData.get("hour")),
    kind: kindOf(formData.get("kind")),
    byAdmin: true,
  });
  back(formData.get("week"), res.ok ? "ok=1" : `e=${encodeURIComponent(res.reason)}`);
}

const TK = { BIOMATIC: "Β", CLINICAL: "Κ", BOTH: "Β+Κ" } as const;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ week?: string; ok?: string; e?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(isDate(sp.week) ? sp.week : localParts(new Date()).date);
  const end = addDays(week, 6);
  const [slots, members] = await Promise.all([
    prisma.slot.findMany({
      where: { date: { gte: week, lte: end }, bookings: { some: {} } },
      include: {
        therapist: { select: { name: true, therapistKind: true } },
        bookings: { include: { member: { select: { id: true, name: true } } } },
        note: { select: { id: true } },
      },
      orderBy: [{ startsAt: "asc" }, { position: "asc" }],
    }),
    prisma.user.findMany({ where: { role: "MEMBER", active: true }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  const withBooking = new Set(slots.flatMap((x) => x.bookings.map((b) => b.member.id)));
  const without = members.filter((m) => !withBooking.has(m.id));
  const flags = slots.flatMap((x) => x.bookings.filter((b) => !b.alternationOk).map((b) => ({ x, b })));
  const pairs = slots.filter((x) => x.kind === "PAIR" && !x.pairApprovedAt);

  return (
    <>
      <div className="row spread">
        <Link href={`/admin/bookings?week=${addDays(week, -7)}`}>← προηγούμενη</Link>
        <h1 style={{ margin: 0 }}>Εβδομάδα {formatDate(week)} – {formatDate(end)}</h1>
        <Link href={`/admin/bookings?week=${addDays(week, 7)}`}>επόμενη →</Link>
      </div>
      {sp.ok && <div className="notice">Έγινε ✓</div>}
      {sp.e && <div className="error">{sp.e}</div>}

      {(flags.length > 0 || pairs.length > 0) && (
        <section className="card" style={{ borderColor: "var(--yellow)" }}>
          <strong>Για έλεγχο</strong>
          <ul>
            {flags.map(({ x, b }) => (
              <li key={b.id} className="row" style={{ gap: 8 }}>
                <span>⚠ Εναλλαγή: {b.member.name}, {formatDate(x.date)} {formatHour(x.hour)} με {x.therapist?.name ?? "—"} — δεν ήταν ελεύθερος ο τύπος που ήταν σειρά του. Άλλαξε θεραπευτή στις Θέσεις ή μετάφερέ το.</span>
                <form action={approveAlternation}>
                  <input type="hidden" name="id" value={b.id} /><input type="hidden" name="week" value={week} />
                  <button type="submit" style={{ padding: "4px 10px" }}>Εντάξει έτσι</button>
                </form>
              </li>
            ))}
            {pairs.map((x) => (
              <li key={x.id} className="row" style={{ gap: 8 }}>
                <span>
                  Therapair {formatDate(x.date)} {formatHour(x.hour)}: {x.bookings.map((b) => b.member.name).join(" & ")}
                  {x.bookings.length < 2 && " (μόνο ένα μέλος)"}
                </span>
                {x.bookings.length === 2 ? (
                  <form action={approvePair}>
                    <input type="hidden" name="slotId" value={x.id} /><input type="hidden" name="week" value={week} />
                    <button type="submit" style={{ padding: "4px 10px" }}>Εγκρίνω το ζευγάρι</button>
                  </form>
                ) : (
                  <form action={toIndividual}>
                    <input type="hidden" name="slotId" value={x.id} /><input type="hidden" name="week" value={week} />
                    <button type="submit" style={{ padding: "4px 10px" }}>Κάνε το ατομική</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Μέρα</th><th>Ώρα</th><th>Δωμ.</th><th>Είδος</th><th>Μέλος</th><th>Θεραπευτής</th><th>Μπήκε</th><th>Διάρκεια</th><th>Σημ.</th><th>Αλλαγή</th></tr>
          </thead>
          <tbody>
            {slots.flatMap((x) =>
              x.bookings.map((b) => {
                const past = x.startsAt < now;
                return (
                  <tr key={b.id}>
                    <td>{formatDate(x.date)}</td>
                    <td>{formatHour(x.hour)}</td>
                    <td>{x.position}</td>
                    <td>{x.kind === "PAIR" ? "Therapair" : "Ατομική"}</td>
                    <td><Link href={`/admin/people/${b.member.id}`}>{b.member.name}</Link> {!b.alternationOk && "⚠"}</td>
                    <td>{x.therapist ? `${x.therapist.name}${x.therapist.therapistKind ? ` (${TK[x.therapist.therapistKind]})` : ""}` : "—"}</td>
                    <td>{b.joinedAt ? "✓" : past ? <span className="badge yellow">όχι</span> : ""}</td>
                    <td>
                      {past && (
                        <form action={setDuration} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="week" value={week} />
                          <input name="minutes" type="number" min={0} defaultValue={b.durationMinutes ?? ""} style={{ width: 70 }} />
                          <button type="submit" style={{ padding: "6px 8px" }}>✓</button>
                        </form>
                      )}
                    </td>
                    <td>{x.note ? <Link href={`/t/s/${x.id}`}>✓</Link> : "—"}</td>
                    <td>
                      {!past && (
                        <details>
                          <summary className="small">Μεταφορά / ακύρωση</summary>
                          <form action={move} className="row" style={{ gap: 4, marginTop: 4 }}>
                            <input type="hidden" name="id" value={b.id} /><input type="hidden" name="week" value={week} />
                            <input name="date" type="date" defaultValue={x.date} required style={{ width: 150 }} />
                            <input name="hour" type="number" min={0} max={23} defaultValue={x.hour} required style={{ width: 70 }} />
                            <select name="kind" defaultValue={x.kind} style={{ width: 120 }}>
                              <option value="INDIVIDUAL">Ατομική</option><option value="PAIR">Therapair</option>
                            </select>
                            <button type="submit" style={{ padding: "6px 8px" }}>Μετάφερε</button>
                          </form>
                          <form action={cancel} style={{ marginTop: 4 }}>
                            <input type="hidden" name="id" value={b.id} /><input type="hidden" name="week" value={week} />
                            <button type="submit" style={{ padding: "6px 8px" }}>Ακύρωση</button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
            {slots.length === 0 && <tr><td colSpan={10} className="muted">Κανένα ραντεβού.</td></tr>}
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
          <select name="memberId" required>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
        <div className="field"><label>Μέρα</label><input name="date" type="date" defaultValue={week} required /></div>
        <div className="field"><label>Ώρα (0–23)</label><input name="hour" type="number" min={0} max={23} required /></div>
        <div className="field">
          <label>Είδος</label>
          <select name="kind"><option value="INDIVIDUAL">Ατομική</option><option value="PAIR">Therapair</option></select>
        </div>
        <div className="field" style={{ alignSelf: "end" }}><button className="primary" type="submit">Κλείσε</button></div>
      </form>
    </>
  );
}
