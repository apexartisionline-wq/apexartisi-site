import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound, redirect } from "next/navigation";
import { AssessmentClient } from "@/components/AssessmentClient";
import { assessmentLines, assessmentSchema, gr, missingForComplete, stripAdminOnly } from "@/lib/assessment";
import { dec } from "@/lib/crypto";
import { assessmentProfile, canWriteAssessmentFor, latestAssessment, saveAssessment } from "@/lib/assessment-db";
import { isPsychologist, seesSafetyDetail } from "@/lib/access";
import { currentRisk } from "@/lib/risk-db";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  if (!(await canWriteAssessmentFor(user, memberId))) notFound();
  const member = await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } });
  if (!member) notFound();
  let raw: unknown = null;
  try { raw = JSON.parse(String(formData.get("payload") ?? "")); } catch {}
  const parsed = assessmentSchema.safeParse(raw);
  const back = `/t/members/${memberId}/assessment`;
  if (!parsed.success) redirect(`${back}?error=${encodeURIComponent("Κάτι δεν συμπληρώθηκε σωστά: " + (parsed.error.issues[0]?.path.join(" ") ?? ""))}`);
  const complete = formData.get("complete") === "1";
  const missing = complete ? missingForComplete(parsed.data) : [];
  // Αν λείπει κάτι για ολοκλήρωση, αποθηκεύεται ως πρόχειρο και λέμε τι λείπει.
  await saveAssessment(memberId, user, parsed.data, complete && missing.length === 0);
  if (missing.length) redirect(`${back}?missing=${encodeURIComponent(missing.join("|"))}`);
  redirect(`${back}?saved=${complete ? "done" : "1"}`);
}

// Αρχική αξιολόγηση (02): τη γράφει ψυχολόγος στην 1η ατομική· οι υπόλοιποι τη διαβάζουν.
export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; missing?: string; v?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true, soberSince: true } });
  if (!member) notFound();
  const latest = await latestAssessment(id);
  // Μόνο ψυχολόγος (ή η διαχείριση) βλέπει την αξιολόγηση (απόφαση 13/10, src/lib/access.ts)· οι υπόλοιποι μία γραμμή.
  // 16/10: και ο θεραπευτής της 1ης ατομικής, όσο δεν έχει ολοκληρωθεί (canWriteAssessmentFor).
  const writer = await canWriteAssessmentFor(user, id);
  if (!isPsychologist(user) && !writer) {
    // Αυξημένες/Υψηλές: «τα βλέπουν όλοι όλα» (απόφαση 14/10) — ανάγνωση χωρίς στοιχεία διαχείρισης, με υδατογράφημα.
    const risk = await currentRisk(id);
    if (latest && seesSafetyDetail(user, risk.level)) {
      await logAccess(user.id, id, "assessment_view");
      return (
        <main>
          <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
          <FolderTabs memberId={id} active="history" />
          <h1 style={{ marginBottom: 4 }}>Αρχική αξιολόγηση</h1>
          <p className="muted" style={{ marginTop: 0 }}>{latest.complete ? "Ολοκληρώθηκε" : "Σε εξέλιξη"} · {latest.author}, {formatWhen(latest.at)} · ανάγνωση: ανάγκες ασφάλειας {risk.level === "HIGH" ? "Υψηλές" : "Αυξημένες"}, τη βλέπει όλη η ομάδα</p>
          <div className="wm"><ReadView d={latest.data} admin={false} /></div>
        </main>
      );
    }
    await logAccess(user.id, id, "assessment_status_view");
    return (
      <main>
        <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
        <FolderTabs memberId={id} active="history" />
        <h1 style={{ marginBottom: 4 }}>Αρχική αξιολόγηση</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {latest ? `${latest.complete ? "Ολοκληρώθηκε" : "Σε εξέλιξη"} · ${latest.author}, ${formatWhen(latest.at)}` : "Δεν έχει ξεκινήσει · ψυχολόγος, 1η ατομική, ~40′"}
        </p>
        {latest?.data.summary && (
          <>
            <h2>Σύνοψη για την ομάδα</h2>
            <div className="card body-text wm">{latest.data.summary}</div>
          </>
        )}
        <div className="card small">Το υπόλοιπο της αρχικής αξιολόγησης (ιστορικό, ερωτηματολόγια, στοιχεία) το βλέπει ψυχολόγος. Ό,τι έχει κλινική σημασία για όλη την ομάδα (σοβαρά σημεία, νηφαλιότητα) φαίνεται στο «Ασφάλεια» και στον φάκελο.</div>
      </main>
    );
  }
  await logAccess(user.id, id, "assessment_view");
  const admin = user.role === "ADMIN";
  const complete = Boolean(latest?.complete);
  const history = await prisma.assessment.findMany({ where: { memberId: id }, orderBy: { createdAt: "desc" }, select: { id: true, authorId: true, createdAt: true, complete: true } });
  const versions = history.length;
  const authors = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(history.map((h) => h.authorId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const historyList = versions > 1 && (
    <details className="card small" style={{ marginTop: 16 }}>
      <summary>Ιστορικό αποθηκεύσεων ({versions})</summary>
      <div className="list">
        {history.map((h, i) => (
          <Link key={h.id} href={`/t/members/${id}/assessment?v=${h.id}`}>
            <span>{formatWhen(h.createdAt)} · {authors.get(h.authorId) ?? ""}{i === 0 ? " · τρέχουσα" : ""}{h.complete ? "" : " · πρόχειρο"}</span>
          </Link>
        ))}
      </div>
    </details>
  );

  const header = (
    <>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="history" />
      <h1 style={{ marginBottom: 4 }}>Αρχική αξιολόγηση</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {latest ? `${complete ? "Ολοκληρώθηκε" : "Σε εξέλιξη"} · ${latest.author}, ${formatWhen(latest.at)}${versions > 1 ? ` · ${versions} αποθηκεύσεις` : ""}` : "Δεν έχει ξεκινήσει · ψυχολόγος, 1η ατομική, ~40′"}
      </p>
      {sp.saved === "done" && <div className="notice">Ολοκληρώθηκε ✓ Η νηφαλιότητα και οι βαθμολογίες πέρασαν στον φάκελο.</div>}
      {sp.saved === "1" && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.missing && (
        <div className="error">
          Αποθηκεύτηκε, αλλά για να ολοκληρωθεί λείπουν:
          <ul style={{ margin: "6px 0 0" }}>{sp.missing.split("|").map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
    </>
  );

  if (sp.v) {
    const row = await prisma.assessment.findFirst({ where: { id: sp.v, memberId: id } });
    if (!row) notFound();
    const old = assessmentSchema.parse(JSON.parse(dec(row.data)));
    return (
      <main>
        {header}
        <div className="notice">Παλιά μορφή: {formatWhen(row.createdAt)} · {authors.get(row.authorId) ?? ""}. <Link href={`/t/members/${id}/assessment`}>Πίσω στην τρέχουσα</Link></div>
        <ReadView d={old} admin={admin} />
        {historyList}
      </main>
    );
  }

  // Εδώ φτάνει ψυχολόγος/διαχείριση ή ο θεραπευτής της 1ης ατομικής (όσο είναι ανοιχτή).
  {
    const initial = latest ? (admin || !complete ? latest.data : stripAdminOnly(latest.data)) : assessmentSchema.parse({});
    // Τα στοιχεία του μέλους φαίνονται στον ψυχολόγο μόνο όσο η αξιολόγηση είναι ανοιχτή.
    let profile = null;
    if (admin || !complete) profile = await assessmentProfile(id);
    return (
      <main>
        {header}
        <AssessmentClient action={save} memberId={id} initial={initial} profile={profile} showAdminFields={admin || !complete} complete={complete} />
        {historyList}
      </main>
    );
  }
}

function ReadView({ d, admin }: { d: ReturnType<typeof assessmentSchema.parse>; admin: boolean }) {
  return (
    <>
      {d.summary && (
        <>
          <h2>Σύνοψη για την ομάδα</h2>
          <div className="card body-text">{d.summary}</div>
        </>
      )}
      {assessmentLines(d, { admin }).map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          <div className="list">
            {s.lines.map(([k, v], i) => (
              <div key={i} style={{ display: "block" }}><div className="sub">{k}</div><div>{v}</div></div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
