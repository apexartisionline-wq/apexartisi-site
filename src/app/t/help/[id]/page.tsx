import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { claim, markTalked } from "@/lib/help";

const fmt = (d: Date) => d.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });

async function doClaim(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("id"));
  await claim(id, user.id);
  redirect(`/t/help/${id}`);
}

async function doTalked(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("id"));
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!outcome) redirect(`/t/help/${id}?e=1`);
  await markTalked(id, user.id, outcome);
  redirect(`/t/help/${id}?done=1`);
}

// Κόκκινο κουμπί για το προσωπικό: ποιος, τηλέφωνο, ανάληψη, «μιλήσαμε» + έκβαση.
export default async function HelpRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; done?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // Τηλέφωνα μελών: ποτέ στους θεραπευτές (απόφαση 10/10 για το κόκκινο κουμπί) — το φορτώνουμε μόνο για τη διαχείριση.
  const req = await prisma.helpRequest.findUnique({ where: { id }, include: { member: { select: { name: true, phone: user.role === "ADMIN" } } } });
  if (!req) notFound();
  await logAccess(user.id, req.isDrill ? null : req.memberId, "help_view");
  const mine = req.claimedById === user.id;
  return (
    <main>
      <p className="muted">{req.isDrill ? "🧪 Δοκιμή" : "🔴 Κόκκινο κουμπί"} · {fmt(req.createdAt)}</p>
      <h1>{req.isDrill ? "Δοκιμαστικό αίτημα" : req.member.name}</h1>
      {!req.isDrill && (
        <div className="card">
          {user.role !== "ADMIN" ? (
            <p style={{ margin: 0 }}><strong>Το τηλέφωνο του μέλους το έχει μόνο η διαχείριση.</strong> Πάρε τη διαχείριση για να επικοινωνήσει με το μέλος ή να σε συνδέσει.</p>
          ) : req.member.phone ? (
            <a className="btn primary big" href={`tel:${req.member.phone}`}>📞 Κάλεσε {req.member.phone}</a>
          ) : (
            <div className="error">Δεν υπάρχει καταχωρημένο τηλέφωνο. Δες τον φάκελο του μέλους.</div>
          )}
          <p className="small" style={{ marginTop: 8 }}>
            <Link href={`/t/members/${req.memberId}`}>Φάκελος</Link> · <Link href={`/t/members/${req.memberId}/safety`}>Πλάνο ασφάλειας</Link>
          </p>
        </div>
      )}
      {sp.done && <div className="notice">Καταγράφηκε ✓ Σε 24 ώρες και σε 7 μέρες θα σου θυμίσουμε το μήνυμα φροντίδας.</div>}
      {sp.e && <div className="error">Γράψε σύντομα την έκβαση.</div>}
      {req.talkedAt ? (
        <div className="card">
          <strong>Μίλησαν</strong> · {req.claimedByName} · {fmt(req.talkedAt)}
          <div className="body-text">{dec(req.outcome)}</div>
        </div>
      ) : !req.claimedAt ? (
        <form action={doClaim} className="card">
          <input type="hidden" name="id" value={req.id} />
          <button className="red big" type="submit">Το αναλαμβάνω</button>
        </form>
      ) : (
        <div className="card">
          <p>Το ανέλαβε: <strong>{req.claimedByName}</strong>, {fmt(req.claimedAt)}.</p>
          {(mine || user.role === "ADMIN") && (
            <form action={doTalked} className="stack">
              <input type="hidden" name="id" value={req.id} />
              <label htmlFor="outcome">Έκβαση (1–2 γραμμές: τι έγινε, είναι ασφαλής, επόμενο βήμα)</label>
              <textarea id="outcome" name="outcome" required style={{ minHeight: 90 }} />
              <button className="primary" type="submit">Μιλήσαμε</button>
            </form>
          )}
        </div>
      )}
      <p className="muted small">Αν υπάρχει άμεσος κίνδυνος για τη ζωή: 112 / ΕΚΑΒ 166. {!req.isDrill && <>Τι κάνουμε ανά επίπεδο: <Link href={`/t/members/${req.memberId}/risk`}>Ανάγκες ασφάλειας</Link>.</>}</p>
    </main>
  );
}
