import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RiskClient } from "@/components/RiskClient";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEVELS, QUESTIONS, riskSchema } from "@/lib/risk";
import { canWriteRisk, riskHistory, riskTrigger, saveRisk } from "@/lib/risk-db";
import { formatWhen } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!canWriteRisk(user)) notFound();
  const memberId = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } }))) notFound();
  let raw: unknown = null;
  try { raw = JSON.parse(String(formData.get("payload") ?? "")); } catch {}
  const parsed = riskSchema.safeParse(raw);
  if (!parsed.success) redirect(`/t/members/${memberId}/risk?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join(" "))}`);
  await saveRisk(memberId, user, parsed.data);
  redirect(`/t/members/${memberId}/risk?saved=1`);
}

const yn = (v: unknown) => (v === true ? "Ναι" : v === false ? "Όχι" : v === "DECLINED" ? "δεν απάντησε ακόμα" : "—");

// Ανάγκες ασφάλειας (03): μόνο όταν υπάρχει λόγος· τη γράφει ψυχολόγος, τη διαβάζουν όλοι.
export default async function RiskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; new?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "risk_view");
  const [history, trigger] = await Promise.all([riskHistory(id), riskTrigger(id)]);
  const canWrite = canWriteRisk(user);
  const current = history[0];
  const reasonFromTrigger = trigger ? ({ "κόκκινο κουμπί": "Κόκκινο κουμπί", υποτροπή: "Υποτροπή", "ανησυχία στο σημείωμα": "Ανησυχία στο σημείωμα" } as Record<string, string>)[trigger.text] : undefined;
  const showForm = canWrite && (sp.new === "1" || !current || trigger);

  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <h1 style={{ marginBottom: 4 }}>Ανάγκες ασφάλειας</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {current ? `Τώρα: ${LEVELS[current.level]} · ${current.author}, ${formatWhen(current.at)}` : trigger ? "Δεν έχει γίνει αξιολόγηση ακόμα" : "Δεν έχει χρειαστεί αξιολόγηση"}
        {" · "}<Link href={`/t/members/${id}/safety`}>Πλάνο ασφάλειας ›</Link>
      </p>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓{current && current.level !== "LOW" && " Φαίνεται σήμερα στο «Σήμερα» όλης της ομάδας."}</div>}
      {sp.error && <div className="error">{sp.error}</div>}
      {trigger && <div className="card small" style={{ borderColor: "var(--yellow)" }}>Θέλει αξιολόγηση: μετά από <strong>{trigger.text}</strong> ({formatWhen(trigger.at)}).</div>}
      {canWrite && (
        <p><Link className="btn red" href={`/t/members/${id}/emergency`}>Έκτακτη ανάγκη</Link> <span className="muted small">Μόνο σε άμεσο κίνδυνο: δείχνει διεύθυνση και επαφή για το 112.</span></p>
      )}

      {showForm ? (
        <RiskClient action={save} memberId={id} initialReason={reasonFromTrigger} />
      ) : (
        canWrite && <p><Link className="btn" href={`/t/members/${id}/risk?new=1`}>Νέα αξιολόγηση</Link></p>
      )}
      {!canWrite && trigger && <p className="muted small">Την κάνει ψυχολόγος.</p>}

      {history.length > 0 && (
        <>
          <h2>Ιστορικό</h2>
          {history.map((h) => (
            <details key={h.id} className="card small" open={h === current && !showForm}>
              <summary><strong>{LEVELS[h.level]}</strong> · {formatWhen(h.at)} · {h.author}{h.data.reason && ` · ${h.data.reason}`}</summary>
              <ul style={{ margin: "8px 0", paddingLeft: 18 }}>{QUESTIONS.map(([k, q]) => <li key={k}>{q} <strong>{yn(h.data[k])}</strong></li>)}</ul>
              <div className="body-text">{h.data.rationale}</div>
              {h.data.actions && <div><span className="muted">Τι έγινε:</span> {h.data.actions}</div>}
            </details>
          ))}
        </>
      )}
    </main>
  );
}
