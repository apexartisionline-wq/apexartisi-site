import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { daysLeft, RETENTION, type RetentionKey } from "@/lib/retention";
import { runRetention, upcomingExpiries } from "@/lib/retention-db";
import { formatDate, formatTime, localParts } from "@/lib/time";

// Χρόνοι τήρησης και αυτόματη εκκαθάριση (έγγραφο 13 του φακέλου συμμόρφωσης, 9/10/2026).

async function addHold(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!reason) redirect("/admin/retention?err=" + encodeURIComponent("Γράψε τον λόγο της αναστολής (π.χ. εκκρεμεί καταγγελία)."));
  const m = await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } });
  if (!m) redirect("/admin/retention?err=" + encodeURIComponent("Διάλεξε μέλος."));
  await prisma.retentionHold.create({ data: { memberId, reason: enc(reason), byId: admin.id } });
  redirect("/admin/retention?ok=1");
}

async function liftHold(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  await prisma.retentionHold.updateMany({ where: { id: String(formData.get("id")), liftedAt: null }, data: { liftedAt: new Date(), liftedById: admin.id } });
  redirect("/admin/retention?ok=1");
}

async function runNow() {
  "use server";
  const admin = await requireRole("ADMIN");
  const r = await runRetention({ dryRun: false, byId: admin.id });
  redirect(`/admin/retention?ran=${r.lines.reduce((a, l) => a + l.count, 0)}`);
}

const CAT: Record<string, string> = { ...Object.fromEntries(Object.values(RETENTION).map((r) => [r.key, r.label])), run: "Εκτέλεση" };
const when = (d: Date) => `${formatDate(localParts(d).date)} ${formatTime(d)}`;
// Με έτος: οι λήξεις απέχουν χρόνια (π.χ. μητρώο 5 έτη).
const dmy = (d: Date) => localParts(d).date.split("-").reverse().join("/");

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; ran?: string }> }) {
  const sp = await searchParams;
  await requireRole("ADMIN");
  const now = new Date();
  const [preview, upcoming, holds, logs, members] = await Promise.all([
    runRetention({ dryRun: true, now }),
    upcomingExpiries(now),
    prisma.retentionHold.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.purgeLog.findMany({ orderBy: { at: "desc" }, take: 60 }),
    prisma.user.findMany({ where: { role: "MEMBER", username: { not: { startsWith: "anon-" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ids = [...new Set([...holds.flatMap((h) => [h.memberId, h.byId, h.liftedById ?? ""]), ...logs.map((l) => l.byId ?? "")].filter(Boolean))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const total = preview.lines.reduce((a, l) => a + l.count, 0);
  const lastRun = logs.find((l) => l.category === "run");

  return (
    <>
      <h1>Τήρηση δεδομένων</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Χρόνοι κατά την Πολιτική διατήρησης και ασφαλούς καταστροφής (έγγραφο 13). Η εκκαθάριση τρέχει <strong>αυτόματα μία φορά την ημέρα</strong>
        {lastRun ? <> · τελευταία: {when(lastRun.at)} ({lastRun.byId ? names.get(lastRun.byId) ?? "—" : "αυτόματα"})</> : " · δεν έχει τρέξει ακόμα"}. Η διαγραφή είναι οριστική,
        μαζί με τις προηγούμενες εκδόσεις· κάθε εκτέλεση γράφεται στο πρωτόκολλο.
      </p>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.ran !== undefined && <div className="notice">Η εκκαθάριση έτρεξε ✓ Διαγράφηκαν {sp.ran} εγγραφές (βλ. πρωτόκολλο).</div>}
      {sp.err && <div className="error">{sp.err}</div>}

      <h2>Χρόνοι τήρησης</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Κατηγορία</th><th>Χρόνος</th><th>Από</th><th>Τι περιλαμβάνει</th><th>Ενέργεια</th></tr></thead>
          <tbody>
            {Object.values(RETENTION).map((r) => (
              <tr key={r.key}>
                <td><strong>{r.label}</strong></td>
                <td>{r.months % 12 === 0 ? `${r.months / 12} ${r.months === 12 ? "έτος" : "έτη"}` : `${r.months} μήνες`}</td>
                <td>{r.from}</td>
                <td className="small">{r.covers}</td>
                <td className="small">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Χωρίς «Ολοκλήρωση συνεργασίας» δεν λήγει τίποτα που μετρά από τη λήξη. Τα αντίγραφα ασφαλείας του παρόχου της βάσης λήγουν μέσα στο δικό τους κυκλικό διάστημα (έως 3 μήνες).
        Δεν καλύπτονται ακόμα (ερώτημα προς τον Υπεύθυνο Προστασίας Δεδομένων): σημειώματα ομάδας, μηνύματα μεταξύ θεραπευτών, λογαριασμοί προσωπικού.
      </p>

      <h2>Τι θα διαγραφόταν τώρα <span className="muted small">(προεπισκόπηση)</span></h2>
      <div className="card stack">
        {total === 0 ? <p className="muted" style={{ margin: 0 }}>Τίποτα δεν έχει λήξει.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {preview.lines.map((l) => <li key={`${l.category}${l.item}`}>{CAT[l.category]}: {l.item} — <strong>{l.count}</strong></li>)}
          </ul>
        )}
        {preview.held > 0 && <p className="hint" style={{ margin: 0 }}>{preview.held} {preview.held === 1 ? "μέλος" : "μέλη"} σε αναστολή διαγραφής δεν αγγίζονται.</p>}
        <form action={runNow}>
          <button type="submit" className="outline" disabled={total === 0}>Εκτέλεση τώρα</button>
          <span className="hint" style={{ marginLeft: 8 }}>Τρέχει και μόνη της κάθε μέρα· το κουμπί χρειάζεται μόνο αν δεν θέλετε να περιμένετε.</span>
        </form>
      </div>

      {preview.noClosure.length > 0 && (
        <div className="notice" style={{ background: "var(--yellow-soft, #fdf5e7)" }}>
          <strong>Ανενεργά μέλη χωρίς «Ολοκλήρωση συνεργασίας» ({preview.noClosure.length}).</strong> Για αυτά δεν μετράει ο χρόνος τήρησης μέχρι να καταγραφεί η λήξη:{" "}
          {preview.noClosure.map((m, i) => <span key={m.id}>{i > 0 && " · "}<Link href={`/admin/people/${m.id}/close`}>{m.name}</Link></span>)}
        </div>
      )}

      <h2>Πότε λήγει ο φάκελος κάθε μέλους</h2>
      <p className="hint">Η διαγραφή γίνεται αυτόματα, μία φορά την ημέρα. Η διαχείριση ειδοποιείται <strong>30 και 7 μέρες πριν</strong> από κάθε λήξη (για να βάλει αναστολή διαγραφής αν χρειάζεται) και <strong>μετά από κάθε διαγραφή</strong> φακέλων μελών.</p>
      {upcoming.length === 0 ? <div className="card muted">Κανένα μέλος με ολοκλήρωση συνεργασίας.</div> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Μέλος</th><th>Λήξη συνεργασίας</th><th>Κλινικός φάκελος</th><th>Μητρώο</th><th></th></tr></thead>
            <tbody>
              {upcoming.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{dmy(u.end)}</td>
                  <td>{u.clinicalDone ? "διαγράφηκε / λήγει τώρα" : <>{dmy(u.clinicalAt)}{daysLeft(u.clinicalAt, now) <= 30 && <> <span className="badge yellow">σε {daysLeft(u.clinicalAt, now)} {daysLeft(u.clinicalAt, now) === 1 ? "μέρα" : "μέρες"}</span></>}</>}</td>
                  <td>{dmy(u.registryAt)}</td>
                  <td>{u.held && <span className="badge yellow">αναστολή</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Αναστολή διαγραφής <span className="muted small">(άρθρο 3.2)</span></h2>
      <div className="card stack">
        <p className="muted small" style={{ margin: 0 }}>Όταν εκκρεμεί δικαστική διαφορά, καταγγελία ή έλεγχος αρχής για ένα μέλος, η αυτόματη διαγραφή του σταματά μέχρι την άρση. Η σημείωση κρατιέται με όνομα και ώρα.</p>
        <form action={addHold} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="stack" style={{ gap: 2 }}><span className="small">Μέλος</span>
            <select name="memberId" defaultValue="" required>
              <option value="" disabled>—</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="stack" style={{ gap: 2, flex: 1, minWidth: 220 }}><span className="small">Λόγος</span><input name="reason" maxLength={500} required placeholder="π.χ. εκκρεμεί καταγγελία στην Αρχή" /></label>
          <button type="submit">Αναστολή</button>
        </form>
        {holds.length > 0 && (
          <div className="list">
            {holds.map((h) => (
              <div key={h.id} className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
                <span>
                  <strong>{names.get(h.memberId) ?? "—"}</strong> · {dec(h.reason)}{" "}
                  <span className="muted small">· {names.get(h.byId) ?? "—"}, {when(h.createdAt)}{h.liftedAt && <> · άρση: {names.get(h.liftedById ?? "") ?? "—"}, {when(h.liftedAt)}</>}</span>
                </span>
                {!h.liftedAt && (
                  <form action={liftHold}><input type="hidden" name="id" value={h.id} /><button type="submit" className="outline sm">Άρση</button></form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <h2>Πρωτόκολλο εκκαθάρισης <span className="muted small">(άρθρο 3.3)</span></h2>
      {logs.length === 0 ? <div className="card muted">Δεν έχει τρέξει ακόμα.</div> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Πότε</th><th>Κατηγορία</th><th>Τι</th><th>Πλήθος</th><th>Εκτελέσας</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{when(l.at)}</td>
                  <td>{CAT[l.category as RetentionKey | "run"] ?? l.category}</td>
                  <td>{l.item}</td>
                  <td>{l.count}</td>
                  <td>{l.byId ? names.get(l.byId) ?? "—" : "αυτόματα"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
