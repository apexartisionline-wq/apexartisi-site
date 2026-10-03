import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EC_WHEN, latestProfile } from "@/lib/assessment-db";
import { logAccess } from "@/lib/audit";
import { notifyRole } from "@/lib/notify";
import { onCallNow } from "@/lib/help";
import { getSettings } from "@/lib/settings";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canWriteRisk } from "@/lib/risk-db";
import { formatTime } from "@/lib/time";

async function reveal(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!canWriteRisk(user)) notFound();
  const memberId = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } }))) notFound();
  // Καταγράφεται ποιος άνοιξε τα στοιχεία και πότε· φαίνεται στο «Σήμερα» όλων (άρα και της διαχείρισης).
  await prisma.teamAlert.create({ data: { memberId, source: "EMERGENCY", kind: "REVEAL", byId: user.id } });
  await logAccess(user.id, memberId, "emergency_reveal");
  // Η διαχείριση ενημερώνεται αμέσως (ουδέτερο κείμενο, χωρίς όνομα μέλους στην οθόνη κλειδώματος).
  await notifyRole("ADMIN", { title: "Άνοιξαν στοιχεία έκτακτης ανάγκης", url: "/admin", tag: `emergency-${memberId}`, urgent: true }).catch(() => undefined);
  redirect(`/t/members/${memberId}/emergency`);
}

export const dynamic = "force-dynamic";

// «Έκτακτη ανάγκη»: σε άμεσο κίνδυνο ο ψυχολόγος βλέπει διεύθυνση και επαφή έκτακτης ανάγκης,
// μόνο τώρα και μόνο αφού το ζητήσει (μένει καταγραφή).
export default async function EmergencyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!canWriteRisk(user)) notFound();
  const { id } = await params;
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  // Τα στοιχεία φαίνονται μόνο για λίγα λεπτά μετά από πραγματικό πάτημα του κουμπιού από τον ίδιο
  // (ελέγχεται η καταγραφή στη βάση, όχι ο σύνδεσμος)· κάθε προβολή καταγράφεται.
  const opened = await prisma.teamAlert.findFirst({
    where: { memberId: id, source: "EMERGENCY", kind: "REVEAL", byId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (opened) await logAccess(user.id, id, "emergency_view");
  const p = opened ? (await latestProfile(id))?.data : null;
  const s = await getSettings();
  const dutyId = await onCallNow();
  const duty = dutyId ? await prisma.user.findUnique({ where: { id: dutyId }, select: { name: true, phone: true } }) : null;
  const tel = (v: string) => <a href={`tel:${v.replace(/\s/g, "")}`}>{v}</a>;
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link href={`/t/members/${id}/risk`}>‹ Ανάγκες ασφάλειας</Link></p>
      <h1>Έκτακτη ανάγκη — {member.name}</h1>
      <div className="card">
        <strong>Μείνε μαζί του/της. Μην κλείσεις τη σύνδεση.</strong>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <a className="btn red" href="tel:112">112 · Άμεσος κίνδυνος</a>
          <a className="btn" href="tel:166">166 · ΕΚΑΒ (ασθενοφόρο)</a>
          <a className="btn" href="tel:1018">1018 · Γραμμή για την αυτοκτονία</a>
        </div>
        <div className="small" style={{ marginTop: 10 }}>
          {s.adminPhone ? <>Διαχείριση: <a href={`tel:${s.adminPhone.replace(/\s/g, "")}`}><strong>{s.adminPhone}</strong></a></> : <span className="muted">Δεν έχει οριστεί τηλέφωνο διαχείρισης (Ρυθμίσεις).</span>}
          {duty && <> · Εφημερεύει τώρα: <strong>{duty.name}</strong>{duty.phone && <> · <a href={`tel:${duty.phone.replace(/\s/g, "")}`}>{duty.phone}</a></>}</>}
        </div>
      </div>
      {!opened ? (
        <form action={reveal} className="card">
          <input type="hidden" name="memberId" value={id} />
          <p style={{ marginTop: 0 }}>Τα στοιχεία (διεύθυνση, επαφή έκτακτης ανάγκης) τα βλέπει κανονικά μόνο η διαχείριση. Άνοιξέ τα μόνο αν κινδυνεύει τώρα. Θα καταγραφεί ότι τα άνοιξες και θα το δει η διαχείριση.</p>
          <button className="red big" type="submit" style={{ width: "100%" }}>Άνοιγμα στοιχείων τώρα</button>
        </form>
      ) : opened && p ? (
        <div className="card">
          <div className="muted small">Άνοιξαν {formatTime(opened.createdAt)} από {user.name} · καταγράφηκε</div>
          <h2 style={{ margin: "8px 0 4px" }}>Διεύθυνση</h2>
          <div style={{ fontSize: "1.15rem" }}>{p.address || "—"}{p.abroadCountry && ` · ${p.abroadCountry}`}</div>
          <h2 style={{ margin: "12px 0 4px" }}>Επαφή έκτακτης ανάγκης</h2>
          {p.ecName ? (
            <div>
              <strong>{p.ecName}</strong>{p.ecRelation && ` (${p.ecRelation})`} · {tel(p.ecPhone)}
              <div className="small muted">{p.ecWhen ? EC_WHEN[p.ecWhen] : "Δεν έχει πει πότε"}{p.ecWhatToSay && ` · Τι λέμε: ${p.ecWhatToSay}`}</div>
            </div>
          ) : <div className="muted">Δεν έχει δώσει.</div>}
        </div>
      ) : (
        <div className="card">Το μέλος δεν έχει συμπληρώσει στοιχεία. Πάρε αμέσως τη διαχείριση{s.adminPhone && <> στο <a href={`tel:${s.adminPhone.replace(/\s/g, "")}`}><strong>{s.adminPhone}</strong></a></>}{duty && <> ή τον/την {duty.name}{duty.phone && <> στο <a href={`tel:${duty.phone.replace(/\s/g, "")}`}>{duty.phone}</a></>}</>}.</div>
      )}
    </main>
  );
}
