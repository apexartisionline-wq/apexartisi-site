import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { TourFor } from "@/components/TourFor";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RiskClient } from "@/components/RiskClient";
import { TwoPlans } from "@/components/TwoPlans";
import { seesSafetyDetail } from "@/lib/access";
import { notifyRole } from "@/lib/notify";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACTIONS, LEVELS, type Level, QUESTIONS, riskSchema } from "@/lib/risk";
import { canWriteRisk, riskHistory, riskTrigger, saveRisk } from "@/lib/risk-db";
import { formatWhen } from "@/lib/time";
import { onCallNow } from "@/lib/help";

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

// Σε άμεσο κίνδυνο, όποιος δεν ανοίγει την «Έκτακτη ανάγκη» (βιωματικός) ενημερώνει τη διαχείριση με ένα πάτημα (απόφαση 14/10):
// επείγουσα ειδοποίηση + κόκκινη γραμμή στο «Σήμερα» της διαχείρισης, με καταγραφή ποιος/πότε. Τα 112/166 μένουν πρώτα.
async function alertAdmin(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const member = await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } });
  if (!member) notFound();
  await prisma.teamAlert.create({ data: { memberId, source: "EMERGENCY", kind: "CALL_ADMIN", byId: user.id } });
  await logAccess(user.id, memberId, "emergency_admin_notify");
  await notifyRole("ADMIN", { title: "Άμεσος κίνδυνος: θεραπευτής ζητά τη διαχείριση τώρα", body: `${user.name} · δες το «Σήμερα»`, url: "/admin", tag: `emergency-${memberId}`, urgent: true }).catch(() => undefined);
  redirect(`/t/members/${memberId}/risk?told=1`);
}

const yn = (v: unknown) => (v === true ? "Ναι" : v === false ? "Όχι" : v === "DECLINED" ? "δεν απάντησε ακόμα" : "—");

// Ανάγκες ασφάλειας (03): μόνο όταν υπάρχει λόγος· τη γράφει ψυχολόγος, τη διαβάζουν όλοι.
export default async function RiskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; new?: string; told?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "risk_view");
  const [history, trigger] = await Promise.all([riskHistory(id), riskTrigger(id)]);
  // Για όποιον δεν ανοίγει την «Έκτακτη ανάγκη»: ποιον καλεί τώρα (σε υπηρεσία, διαχείριση) — τηλέφωνα προσωπικού, όχι μέλους.
  const dutyId = canWriteRisk(user) ? null : await onCallNow();
  const reach = canWriteRisk(user) ? [] : await prisma.user.findMany({
    where: { active: true, OR: [{ role: "ADMIN" }, ...(dutyId ? [{ id: dutyId }] : [])] },
    select: { id: true, name: true, phone: true, role: true },
    orderBy: { name: "asc" },
  });
  const canWrite = canWriteRisk(user);
  const current = history[0];
  // Απαντήσεις και αιτιολόγηση: ψυχολόγος — ή όλοι, όταν το επίπεδο είναι Αυξημένες/Υψηλές (απόφαση 14/10, src/lib/access.ts).
  const detail = seesSafetyDetail(user, current?.level);
  const reasonFromTrigger = trigger ? ({ "κόκκινο κουμπί": "Κόκκινο κουμπί", υποτροπή: "Υποτροπή", "ανησυχία στο σημείωμα": "Ανησυχία στο σημείωμα", "σκέψεις στο ημερολόγιο": "Σκέψεις στο ημερολόγιο", "χρήση στο ημερολόγιο": "Χρήση στο ημερολόγιο" } as Record<string, string>)[trigger.text] : undefined;
  const showForm = canWrite && (sp.new === "1" || !current || trigger);

  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="safety" />
      <div className="page-head">
        <div>
          <h1>Ανάγκες ασφάλειας</h1>
          <p className="page-sub">
            {member.name} · {current ? `Τώρα: ${LEVELS[current.level]} · ${current.author}, ${formatWhen(current.at)}` : trigger ? "Δεν έχει γίνει αξιολόγηση ακόμα" : "Δεν έχει χρειαστεί"}
          </p>
        </div>
      </div>

      <TwoPlans memberId={id} here="risk" />

      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓{current && current.level !== "LOW" && " Φαίνεται σήμερα στο «Σήμερα» όλης της ομάδας."}</div>}
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.told && <div className="notice">Η διαχείριση ειδοποιήθηκε ✓ (επείγουσα ειδοποίηση και γραμμή στο «Σήμερα» της). Μείνε με το μέλος στη γραμμή.</div>}
      {trigger && <div className="card small" style={{ borderColor: "var(--yellow)" }} data-tour="trigger">Θέλει αξιολόγηση: μετά από <strong>{trigger.text}</strong> ({formatWhen(trigger.at)}).</div>}

      {/* Οι οδηγίες άμεσου κινδύνου (πρωτόκολλο «Υψηλές», ACTIONS.HIGH) φαίνονται πάντα, όχι μόνο αφού διαλέξει επίπεδο. */}
      <div className="attn" style={{ marginTop: 12 }}>
        <span className="iconbox red"><Icon name="alert" /></span>
        <div>
          <strong>Σε άμεσο κίνδυνο — ισχύει πάντα, ανεξάρτητα από επίπεδο</strong>
          <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{ACTIONS.HIGH.map((a) => <li key={a}>{a}</li>)}</ul>
          {canWrite ? (
            <p data-tour="emergency" style={{ margin: "10px 0 0" }}><Link className="btn red" href={`/t/members/${id}/emergency`}>Έκτακτη ανάγκη</Link> <span className="muted small">Μόνο σε άμεσο κίνδυνο: δείχνει διεύθυνση και επαφή για το 112.</span></p>
          ) : (
            <div className="hint" style={{ margin: "8px 0 0" }} data-tour="reach">
              Την «Έκτακτη ανάγκη» (διεύθυνση και επαφή για το 112) την ανοίγει ψυχολόγος ή η διαχείριση. Μείνε με το μέλος στη γραμμή και ενημέρωσε τη διαχείριση:{" "}
              {reach.length === 0 ? "τη διαχείριση." : reach.map((u, i) => (
                <span key={u.id}>{i > 0 && " · "}<strong>{u.name}</strong>{u.id === dutyId ? " (σε υπηρεσία)" : u.role === "ADMIN" ? " (διαχείριση)" : ""}{u.phone && <> <a href={`tel:${u.phone.replace(/\s/g, "")}`}>{u.phone}</a></>}</span>
              ))}
              <form action={alertAdmin} style={{ marginTop: 8 }}>
                <input type="hidden" name="memberId" value={id} />
                <button type="submit" className="red">Ειδοποίησε τη διαχείριση τώρα</button>
                <span className="muted small" style={{ marginLeft: 8 }}>Επείγουσα ειδοποίηση στη διαχείριση και γραμμή στο «Σήμερα» της· καταγράφεται ποιος και πότε.</span>
              </form>
            </div>
          )}
        </div>
      </div>

      <details className="fold" id="protocol" style={{ marginBottom: 12 }}>
        <summary>Τι κάνουμε σε κάθε επίπεδο (πρωτόκολλο της ομάδας)</summary>
        {(Object.keys(LEVELS) as Level[]).map((l) => (
          <div key={l} style={{ marginTop: 8 }}>
            <span className={`pill ${l === "HIGH" ? "red" : l === "MEDIUM" ? "yellow" : "ok"}`}>{LEVELS[l]}</span>
            <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{ACTIONS[l].map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>Το επίπεδο το ορίζει ψυχολόγος· η αξιολόγηση γίνεται μόνο όταν υπάρχει λόγος.</p>
      </details>

      {showForm ? (
        <div data-tour="riskform"><RiskClient action={save} memberId={id} initialReason={reasonFromTrigger} /></div>
      ) : (
        canWrite && <p><Link className="btn" href={`/t/members/${id}/risk?new=1`}>Νέα αξιολόγηση</Link></p>
      )}
      {!canWrite && trigger && <p className="muted small">Την κάνει ψυχολόγος.</p>}

      {history.length > 0 && !detail && (
        <p className="muted small">{history.length} {history.length === 1 ? "αξιολόγηση" : "αξιολογήσεις"} · τις απαντήσεις και την αιτιολόγηση τις βλέπει ψυχολόγος (σε Αυξημένες/Υψηλές τις βλέπει όλη η ομάδα).</p>
      )}
      {history.length > 0 && detail && (
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
      <TourFor id="risk" userId={user.id} />
    </main>
  );
}
