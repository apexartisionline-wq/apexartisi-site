import Link from "next/link";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { MemberAssignments } from "@/components/MemberAssignments";
import { MemberSessions } from "@/components/MemberSessions";
import { SafetyZone } from "@/components/SafetyZone";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caseHistory, memberConsistency } from "@/lib/handover";
import { CASE_FIELDS } from "@/lib/handover-rules";
import { memberIntake } from "@/lib/intake";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { cycleInfo } from "@/lib/member";
import { programDay } from "@/lib/program";
import { formatDate, formatWhen, localParts } from "@/lib/time";

// Καρτέλα μέλους για τους θεραπευτές — όλοι δουλεύουν με όλα τα μέλη.
// Το ημερολόγιο ανάκαμψης και ο δείκτης δεν εμφανίζονται εδώ — τα βλέπει μόνο η Εύα.
export default async function TherapistMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const today = localParts(new Date()).date;
  const [cycle, intake, consistency, [summary], plan, noteCount] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    memberConsistency(id),
    caseHistory(id, 1),
    prisma.safetyPlan.findUnique({ where: { memberId: id }, select: { updatedAt: true } }),
    prisma.sessionNote.count({ where: { slot: { bookings: { some: { memberId: id } } } } }),
  ]);
  const riskCheck = intake.checks.find((c) => c.key === "risk");
  const assessment = intake.checks.find((c) => c.key === "assessment");
  const practicalOk = !intake.status.missingConsents.length && !intake.status.missingSteps.some((x) => x.admin);
  const staffNames = new Map(
    (await prisma.user.findMany({ where: { id: { in: [riskCheck?.doneById, assessment?.doneById].filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const risk = riskCheck?.value as keyof typeof RISK_LEVELS | undefined;
  return (
    <main>
      <h1>{member.name}</h1>
      <SafetyZone memberId={id} />
      <div className="card">
        <div className="row spread">
          <strong>Συνέπεια · {consistency.weeks} εβδομάδες</strong>
          <span className="muted small">Μέρα {programDay(member.programStartDate, today) ?? "—"}{cycle && ` · κύκλος ${cycle.done} από ${cycle.length}`}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          Ομάδες: <strong>{consistency.groups} από {consistency.groupDays.length}</strong>
          {consistency.groupDays.length > 0 && <span className="muted"> ({Math.round((consistency.groups / consistency.groupDays.length) * 100)}%)</span>}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 6 }} aria-label="Παρουσίες στις ομάδες, μέρα με μέρα">
          {consistency.groupDays.map((d) => (
            <span key={d.date} title={`${formatDate(d.date)}: ${d.present ? "ήρθε" : "δεν ήρθε"}`} className={`dot${d.present ? " ok" : ""}`} />
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          Ατομικές: <strong>{consistency.sessionsDone} από {consistency.sessionsTotal}</strong>
          {consistency.sessionsTotal > consistency.sessionsDone && <span className="muted"> · δεν ήρθε σε {consistency.sessionsTotal - consistency.sessionsDone}</span>}
        </div>
      </div>
      {sp.case && <div className="notice">Η σύνοψη αποθηκεύτηκε ✓</div>}
      <h2>Κλινικός φάκελος</h2>
      <div className="list">
        <Link href={`/t/members/${id}/start`}>
          <span>
            <div>Ανάγκες ασφάλειας: <strong>{risk ? RISK_LEVELS[risk] : "δεν έχουν αξιολογηθεί"}</strong></div>
            <div className="sub">
              {risk && riskCheck ? `${RISK_INFO[risk].action} · ${formatDate(localParts(riskCheck.doneAt).date)}, ${staffNames.get(riskCheck.doneById) ?? ""}` : "Την ορίζει ψυχολόγος (03)"}
            </div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/safety`}>
          <span>
            <div>Πλάνο ασφάλειας</div>
            <div className="sub">{plan ? `Ενημερώθηκε ${formatDate(localParts(plan.updatedAt).date)}` : "Δεν έχει γραφτεί"}</div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/start`}>
          <span>
            <div>Αρχική αξιολόγηση</div>
            <div className="sub">{assessment ? `✓ ${formatDate(localParts(assessment.doneAt).date)}, ${staffNames.get(assessment.doneById) ?? ""}` : "Εκκρεμεί"}</div>
          </span>
        </Link>
        <div>
          <span>
            <div>Πρακτικά</div>
            <div className="sub">{practicalOk ? "Σε τάξη ✓" : "Εκκρεμούν · τα χειρίζεται η διαχείριση"}</div>
          </span>
        </div>
      </div>
      <h2>Σύνοψη περίπτωσης</h2>
      <div className="card">
        {summary ? (
          <>
            {CASE_FIELDS.filter((f) => summary.data[f.key]).map((f) => (
              <div key={f.key} style={{ marginBottom: 8 }}>
                <div className="muted small">{f.label}</div>
                <div className="body-text">{summary.data[f.key]}</div>
              </div>
            ))}
            <div className="row spread small">
              <span className="muted">{summary.author} · {formatWhen(summary.at)}</span>
              <Link href={`/t/members/${id}/case`}>Ενημέρωση / ιστορικό</Link>
            </div>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Δεν έχει γραφτεί ακόμα. <Link href={`/t/members/${id}/case`}>Γράψε τη σύνοψη</Link>
          </p>
        )}
      </div>
      <h2>Ατομικές και σημειώματα</h2>
      <div className="list">
        <Link href={`/t/members/${id}/notes`}><span>Όλα τα σημειώματα ({noteCount}), με φίλτρα</span></Link>
      </div>
      <MemberSessions memberId={id} limit={5} />
      <h2>Εργασίες</h2>
      <MemberAssignments memberId={id} />
    </main>
  );
}
