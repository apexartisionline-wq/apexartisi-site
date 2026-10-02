import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssessmentClient } from "@/components/AssessmentClient";
import { assessmentLines, assessmentSchema, auditScore, missingForComplete, stripAdminOnly } from "@/lib/assessment";
import { canWriteAssessment, EC_WHEN, latestAssessment, latestProfile, saveAssessment } from "@/lib/assessment-db";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatWhen } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!canWriteAssessment(user)) notFound();
  const memberId = String(formData.get("memberId"));
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
export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; missing?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true, soberSince: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "assessment_view");
  const admin = user.role === "ADMIN";
  const canEdit = canWriteAssessment(user);
  const latest = await latestAssessment(id);
  const complete = Boolean(latest?.complete);
  const versions = await prisma.assessment.count({ where: { memberId: id } });

  const header = (
    <>
      <p style={{ margin: "8px 0 0" }}><Link href={`/t/members/${id}`}>‹ {member.name}</Link></p>
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

  if (canEdit) {
    const initial = latest ? (admin || !complete ? latest.data : stripAdminOnly(latest.data)) : assessmentSchema.parse({});
    // Τα στοιχεία του μέλους φαίνονται στον ψυχολόγο μόνο όσο η αξιολόγηση είναι ανοιχτή.
    let profile = null;
    if (admin || !complete) {
      const p = await latestProfile(id);
      const rows: [string, string][] = p
        ? ([
            ["Ονοματεπώνυμο", p.data.fullName],
            ["Τον/την λέμε", p.data.preferredName],
            ["Γέννηση", p.data.birthDate && formatDate(p.data.birthDate)],
            ["Κινητό", p.data.mobile],
            ["Email", p.data.email],
            ["Διεύθυνση", p.data.address],
            ["Ζει εκτός Ελλάδας", p.data.abroadCountry],
            ["Έκτακτη ανάγκη", [p.data.ecName, p.data.ecRelation].filter(Boolean).join(" · ")],
            ["Τηλέφωνο επαφής", p.data.ecPhone],
            ["Πότε την καλούμε", p.data.ecWhen ? EC_WHEN[p.data.ecWhen] : ""],
            ["Τι της λέμε", p.data.ecWhatToSay],
          ] as [string, string][]).filter(([, v]) => v)
        : [];
      profile = { rows, at: p ? formatWhen(p.at) : "" };
    }
    return (
      <main>
        {header}
        <AssessmentClient action={save} memberId={id} initial={initial} profile={profile} showAdminFields={admin || !complete} complete={complete} />
      </main>
    );
  }

  // Ανάγνωση (βιωματικοί σύμβουλοι): χωρίς στοιχεία ταυτότητας και πεδία διαχείρισης.
  if (!latest) {
    return (
      <main>
        {header}
        <div className="card muted">Την κάνει ψυχολόγος στην 1η ατομική.</div>
      </main>
    );
  }
  const a = auditScore(latest.data.audit);
  return (
    <main>
      {header}
      {latest.data.summary && (
        <>
          <h2>Σύνοψη για την ομάδα</h2>
          <div className="card body-text">{latest.data.summary}</div>
        </>
      )}
      {assessmentLines(latest.data, { admin: false }).map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          <div className="list">
            {s.lines.map(([k, v], i) => (
              <div key={i} style={{ display: "block" }}><div className="sub">{k}</div><div>{v}</div></div>
            ))}
          </div>
        </section>
      ))}
      {!a && <p className="muted small">Χωρίς AUDIT.</p>}
    </main>
  );
}
