import Link from "next/link";
import { redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/time";

async function close(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const r = await prisma.incident.update({ where: { id }, data: { closedAt: new Date(), closedById: admin.id, closeNote: enc(note) } });
  await logAccess(admin.id, r.memberId, "incident_close");
  redirect("/admin/incidents");
}

// Η Εύα διαβάζει κάθε συμβάν και το κλείνει (με σημείωση αν χρειάζεται).
export default async function AdminIncidents() {
  await requireRole("ADMIN");
  const rows = await prisma.incident.findMany({ orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { happenedAt: "desc" }], take: 50 });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.memberId, r.authorId]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const open = rows.filter((r) => !r.closedAt);
  return (
    <>
      <h1>Συμβάντα</h1>
      <h2>Ανοιχτά ({open.length})</h2>
      {open.length === 0 && <div className="card muted">Κανένα.</div>}
      {open.map((r) => {
        const d = JSON.parse(dec(r.data)) as { what: string; actions: string; informed: string; outcome: string };
        return (
          <form key={r.id} action={close} className="card small">
            <input type="hidden" name="id" value={r.id} />
            <strong>{r.kind}</strong> · <Link href={`/t/members/${r.memberId}/incident`}>{names.get(r.memberId)}</Link> · {formatWhen(r.happenedAt)} · {names.get(r.authorId)}
            <div style={{ marginTop: 6 }}><span className="muted">Τι έγινε:</span> <span className="body-text">{d.what}</span></div>
            <div><span className="muted">Τι κάναμε:</span> {d.actions}</div>
            {d.informed && <div><span className="muted">Ενημερώθηκαν:</span> {d.informed}</div>}
            {d.outcome && <div><span className="muted">Πώς έληξε:</span> {d.outcome}</div>}
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <input name="note" placeholder="σημείωση (προαιρετικό)" style={{ flex: 1 }} />
              <button className="primary" type="submit">Έκλεισε</button>
            </div>
          </form>
        );
      })}
      <h2>Κλειστά</h2>
      <div className="list">
        {rows.filter((r) => r.closedAt).map((r) => (
          <Link key={r.id} href={`/t/members/${r.memberId}/incident`}><span><div>{r.kind} · {names.get(r.memberId)}</div><div className="sub">{formatWhen(r.happenedAt)} · έκλεισε {formatWhen(r.closedAt!)}</div></span></Link>
        ))}
      </div>
    </>
  );
}
