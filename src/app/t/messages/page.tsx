import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { notifyMembers } from "@/lib/notify";
import { formatWhen } from "@/lib/time";

const ROLE = { THERAPIST: "θεραπευτής", ADMIN: "διαχείριση" } as const;

// Μηνύματα μέσα στην ομάδα: θεραπευτής ↔ θεραπευτής ή διαχείριση, ένας προς έναν.
// Δεν σβήνονται· κάθε απάντηση είναι νέο μήνυμα με όνομα και ώρα.
async function send(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const toId = String(formData.get("to") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const to = await prisma.user.findFirst({ where: { id: toId, active: true, role: { in: ["THERAPIST", "ADMIN"] } }, select: { id: true } });
  if (!to || to.id === user.id) redirect("/t/messages?e=to");
  if (!body) redirect(`/t/messages?with=${toId}&e=empty`);
  await prisma.staffMessage.create({ data: { fromId: user.id, toId, body: enc(body) } });
  // Ειδοποίηση στο κινητό· μέσα στις ήσυχες ώρες (22:00–08:00) περιμένει ως το πρωί.
  await notifyMembers([toId], { title: `Νέο μήνυμα από ${user.name}`, url: `/t/messages?with=${user.id}`, tag: `staff-msg-${user.id}` });
  redirect(`/t/messages?with=${toId}&sent=1`);
}

export default async function StaffMessages({ searchParams }: { searchParams: Promise<{ with?: string; sent?: string; e?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const staff = await prisma.user.findMany({
    where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true, id: { not: user.id } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const other = staff.find((s) => s.id === sp.with) ?? null;
  // Ό,τι άνοιξε τώρα μετράει ως διαβασμένο (πριν φτιαχτεί η λίστα με τα αδιάβαστα).
  if (other) await prisma.staffMessage.updateMany({ where: { fromId: other.id, toId: user.id, readAt: null }, data: { readAt: new Date() } });

  // Λίστα συνομιλιών: με ποιους έχει ανταλλάξει μηνύματα, πιο πρόσφατες πρώτα, με αδιάβαστα.
  const mine = await prisma.staffMessage.findMany({
    where: { OR: [{ fromId: user.id }, { toId: user.id }] },
    orderBy: { createdAt: "desc" },
    select: { fromId: true, toId: true, createdAt: true, readAt: true },
    take: 500,
  });
  const convo = new Map<string, { last: Date; unread: number }>();
  for (const m of mine) {
    const k = m.fromId === user.id ? m.toId : m.fromId;
    const c = convo.get(k) ?? { last: m.createdAt, unread: 0 };
    if (m.toId === user.id && !m.readAt) c.unread++;
    convo.set(k, c);
  }
  const people = staff.filter((s) => convo.has(s.id));

  let thread: { id: string; mine: boolean; body: string; at: Date; readAt: Date | null }[] = [];
  if (other) {
    const rows = await prisma.staffMessage.findMany({
      where: { OR: [{ fromId: user.id, toId: other.id }, { fromId: other.id, toId: user.id }] },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    thread = rows.map((r) => ({ id: r.id, mine: r.fromId === user.id, body: dec(r.body), at: r.createdAt, readAt: r.readAt }));
  }

  return (
    <main>
      <h1>Μηνύματα ομάδας</h1>
      <p className="muted" style={{ marginTop: 0 }}>Ένας προς έναν, ανάμεσα σε θεραπευτές και τη διαχείριση. Τα μηνύματα δεν σβήνονται. Για ένα μέλος, ό,τι είναι κλινικό γράφεται και στο σημείωμα.</p>
      {sp.e === "to" && <div className="error">Διάλεξε σε ποιον το στέλνεις.</div>}
      <div className="msg-layout">
        <aside>
          <form method="get" className="card">
            <label htmlFor="with"><strong>Νέο μήνυμα προς</strong></label>
            <div className="row" style={{ gap: 6, flexWrap: "nowrap", marginTop: 6 }}>
              <select id="with" name="with" defaultValue={other?.id ?? ""} required style={{ flex: 1 }}>
                <option value="" disabled>Διάλεξε</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({ROLE[s.role as keyof typeof ROLE]})</option>)}
              </select>
              <button type="submit">Άνοιγμα</button>
            </div>
          </form>
          {people.length > 0 && (
            <div className="list">
              {people.map((p) => {
                const c = convo.get(p.id)!;
                return (
                  <Link key={p.id} href={`/t/messages?with=${p.id}`} className={p.id === other?.id ? "active" : undefined}>
                    <span>
                      <div className="title">{p.name}</div>
                      <div className="sub">{formatWhen(c.last)}</div>
                    </span>
                    {c.unread > 0 && <span className="badge red">{c.unread}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </aside>
        <section>
          {other ? (
            <div className="card msg-thread">
              <div className="row spread"><strong>{other.name}</strong><span className="muted small">{ROLE[other.role as keyof typeof ROLE]}</span></div>
              <div className="msg-list">
                {thread.length === 0 && <p className="muted">Δεν έχετε ανταλλάξει μηνύματα ακόμα.</p>}
                {thread.map((m) => (
                  <div key={m.id} className={`msg ${m.mine ? "mine" : "theirs"}`}>
                    <div className="body-text">{m.body}</div>
                    <div className="msg-meta">{m.mine ? "Εσύ" : other.name} · {formatWhen(m.at)}{m.mine && (m.readAt ? " · διαβάστηκε" : " · δεν διαβάστηκε ακόμα")}</div>
                  </div>
                ))}
              </div>
              {sp.sent && <div className="notice">Στάλθηκε ✓</div>}
              {sp.e === "empty" && <div className="error">Γράψε το μήνυμα.</div>}
              <form action={send}>
                <input type="hidden" name="to" value={other.id} />
                <label htmlFor="body" className="sr-only">Μήνυμα</label>
                <textarea id="body" name="body" rows={3} maxLength={4000} placeholder={`Μήνυμα προς ${other.name}…`} required />
                <button className="primary" type="submit" style={{ marginTop: 8 }}>Αποστολή</button>
              </form>
            </div>
          ) : (
            <p className="muted">Διάλεξε σε ποιον θέλεις να γράψεις.</p>
          )}
        </section>
      </div>
    </main>
  );
}
