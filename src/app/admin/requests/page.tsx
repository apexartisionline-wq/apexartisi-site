import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { cancelBooking, moveBooking } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { formatDate, formatHour, localParts } from "@/lib/time";

const fmt = (d: Date) => d.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });

// Αιτήματα αλλαγής/ακύρωσης από τα μέλη· τα εκτελεί η Εύα.
async function handle(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const action = String(formData.get("action"));
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 500);
  const req = await prisma.changeRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") redirect("/admin/requests");
  if (action === "cancel" && req.bookingId) {
    await cancelBooking(req.bookingId);
  } else if (action === "move" && req.bookingId) {
    const kind = formData.get("kind") === "PAIR" ? "PAIR" : "INDIVIDUAL";
    const res = await moveBooking(req.bookingId, String(formData.get("date")), Number(formData.get("hour")), kind);
    if (!res.ok) redirect(`/admin/requests?e=${encodeURIComponent(res.reason)}`);
  }
  await prisma.changeRequest.update({
    where: { id },
    data: { status: action === "decline" ? "DECLINED" : "DONE", reply, handledAt: new Date() },
  });
  redirect("/admin/requests?ok=1");
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const sp = await searchParams;
  const [pending, recent] = await Promise.all([
    prisma.changeRequest.findMany({
      where: { status: "PENDING" },
      include: { member: { select: { id: true, name: true } }, booking: { include: { slot: true } } },
      orderBy: { sessionAt: "asc" },
    }),
    prisma.changeRequest.findMany({
      where: { status: { not: "PENDING" } },
      include: { member: { select: { name: true } } },
      orderBy: { handledAt: "desc" },
      take: 20,
    }),
  ]);
  const today = localParts(new Date()).date;
  return (
    <>
      <h1>Αιτήματα αλλαγής</h1>
      {sp.ok && <div className="notice">Έγινε ✓ Το μέλος βλέπει την απάντηση στην αρχική του.</div>}
      {sp.e && <div className="error">{sp.e}</div>}
      {pending.length === 0 && <p className="muted">Κανένα αίτημα σε αναμονή.</p>}
      {pending.map((r) => (
        <section className="card" key={r.id}>
          <div className="row spread">
            <strong><Link href={`/admin/people/${r.member.id}`}>{r.member.name}</Link> · {r.kind === "CANCEL" ? "ακύρωση" : "αλλαγή ώρας"}</strong>
            <span className="muted small">στάλθηκε {fmt(r.createdAt)}</span>
          </div>
          <p>
            Ραντεβού: {r.booking ? `${formatDate(r.booking.slot.date)} ${formatHour(r.booking.slot.hour)}` : fmt(r.sessionAt)}
            {r.message && <><br /><span className="muted">«{r.message}»</span></>}
          </p>
          <form action={handle} className="stack">
            <input type="hidden" name="id" value={r.id} />
            <div className="field" style={{ margin: 0 }}>
              <label>Απάντηση στο μέλος (προαιρετικό)</label>
              <input name="reply" placeholder="π.χ. Σε μετέφερα Πέμπτη 17:00" />
            </div>
            <div className="row">
              <input name="date" type="date" defaultValue={r.booking?.slot.date ?? today} style={{ width: 160 }} />
              <input name="hour" type="number" min={0} max={23} defaultValue={r.booking?.slot.hour} style={{ width: 80 }} />
              <select name="kind" defaultValue={r.booking?.slot.kind ?? "INDIVIDUAL"} style={{ width: 130 }}>
                <option value="INDIVIDUAL">Ατομική</option><option value="PAIR">Therapair</option>
              </select>
              <button name="action" value="move" className="primary">Μετάφερε</button>
              <button name="action" value="cancel">Ακύρωσε το ραντεβού</button>
              <button name="action" value="decline">Δεν γίνεται</button>
            </div>
          </form>
        </section>
      ))}
      <h2>Πρόσφατα</h2>
      <div className="card small">
        {recent.length === 0 ? <span className="muted">—</span> : (
          <ul>
            {recent.map((r) => (
              <li key={r.id}>{r.member.name} · {r.kind === "CANCEL" ? "ακύρωση" : "αλλαγή"} · {r.status === "DONE" ? "έγινε" : "δεν έγινε"}{r.reply && ` — ${r.reply}`}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
