import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { INCIDENT_KINDS, type IncidentData, incidentSchema } from "@/lib/incident";
import { notifyRole } from "@/lib/notify";
import { athensToUtc, formatWhen, localParts } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } }))) notFound();
  const get = (k: string) => String(formData.get(k) ?? "");
  const parsed = incidentSchema.safeParse({ kind: get("kind"), happenedAt: get("happenedAt"), what: get("what"), actions: get("actions"), informed: get("informed"), outcome: get("outcome") });
  if (!parsed.success) redirect(`/t/members/${memberId}/incident?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Κάτι λείπει.")}`);
  const { kind, happenedAt, ...rest } = parsed.data;
  const [d, hm] = happenedAt.split("T");
  const [h, m] = hm.split(":").map(Number);
  await prisma.incident.create({ data: { memberId, kind, happenedAt: athensToUtc(d, h, m), data: enc(JSON.stringify(rest)), authorId: user.id } });
  await logAccess(user.id, memberId, "incident_create");
  await notifyRole("ADMIN", { title: "Νέο συμβάν — να το δεις", url: "/admin/incidents", tag: "incident" });
  redirect(`/t/members/${memberId}/incident?saved=1`);
}

// Συμβάντα (08): μόνο για σοβαρά. Γράφει όποιος το χειρίστηκε· το διαβάζει και το κλείνει η Εύα.
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; new?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "incident_view");
  const rows = await prisma.incident.findMany({ where: { memberId: id }, orderBy: { happenedAt: "desc" } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.authorId, r.closedById ?? ""]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const now = localParts(new Date());
  const nowLocal = `${now.date}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
  const area = (name: string, label: string, ph = "", required = false) => (
    <div className="field"><label htmlFor={name}>{label}{!required && <span className="muted small"> · αν υπάρχει</span>}</label><textarea id={name} name={name} required={required} placeholder={ph} style={{ minHeight: 70 }} /></div>
  );
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <h1>Συμβάντα</h1>
      <p className="muted small">Μόνο για σοβαρά: κλήση 112/ΕΚΑΒ, κίνδυνος για τη ζωή, παιδί σε κίνδυνο ή βία, μέλος σε κίνδυνο που δεν βρέθηκε, παραβίαση εμπιστευτικότητας. Γράφεται την ίδια μέρα, από όποιον το χειρίστηκε.</p>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓ Ενημερώθηκε η διαχείριση.</div>}
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.new === "1" || rows.length === 0 ? (
        <form action={save} className="card">
          <input type="hidden" name="memberId" value={id} />
          <div className="field"><label htmlFor="kind">Τι είδους</label>
            <select id="kind" name="kind" required defaultValue="">{["", ...INCIDENT_KINDS].map((k) => <option key={k} value={k} disabled={!k}>{k || "διάλεξε"}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="happenedAt">Πότε έγινε</label><input id="happenedAt" name="happenedAt" type="datetime-local" defaultValue={nowLocal} required /></div>
          {area("what", "Τι έγινε (με ώρες, χωρίς ερμηνείες)", "π.χ. 21:10 πάτησε το κόκκινο κουμπί· 21:14 μιλήσαμε· είπε «…»", true)}
          {area("actions", "Τι κάναμε", "π.χ. έμεινα στη γραμμή, κάλεσα 166 με τη διεύθυνση από την «Έκτακτη ανάγκη»", true)}
          {area("informed", "Ποιον ενημερώσαμε", "π.χ. διαχείριση 21:30, επαφή έκτακτης ανάγκης")}
          {area("outcome", "Πώς έληξε", "π.χ. είναι ασφαλής, επαφή αύριο 12:00")}
          <button className="primary" type="submit">Αποθήκευση</button>
        </form>
      ) : <p><Link className="btn" href={`/t/members/${id}/incident?new=1`}>+ Νέο συμβάν</Link></p>}

      {rows.map((r) => {
        const d = JSON.parse(dec(r.data)) as Omit<IncidentData, "kind" | "happenedAt">;
        return (
          <details key={r.id} className="card small">
            <summary><strong>{r.kind}</strong> · {formatWhen(r.happenedAt)} · {names.get(r.authorId)} · {r.closedAt ? <span style={{ color: "var(--ok)" }}>έκλεισε</span> : <span style={{ color: "var(--yellow)" }}>ανοιχτό</span>}</summary>
            <div style={{ marginTop: 6 }}><span className="muted">Τι έγινε:</span> <span className="body-text">{d.what}</span></div>
            <div><span className="muted">Τι κάναμε:</span> {d.actions}</div>
            {d.informed && <div><span className="muted">Ενημερώθηκαν:</span> {d.informed}</div>}
            {d.outcome && <div><span className="muted">Πώς έληξε:</span> {d.outcome}</div>}
            <div className="muted">Γράφτηκε {formatWhen(r.createdAt)}{r.closedAt && ` · έκλεισε ${formatWhen(r.closedAt)} από ${names.get(r.closedById!) ?? ""}${dec(r.closeNote) ? ` — ${dec(r.closeNote)}` : ""}`}</div>
          </details>
        );
      })}
    </main>
  );
}
