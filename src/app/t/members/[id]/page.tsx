import Link from "next/link";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { MemberAssignments } from "@/components/MemberAssignments";
import { MemberSessions } from "@/components/MemberSessions";
import { SafetyZone } from "@/components/SafetyZone";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caseHistory } from "@/lib/handover";
import { CASE_FIELDS } from "@/lib/handover-rules";
import { memberIntake } from "@/lib/intake";
import { RISK_LEVELS } from "@/lib/intake-rules";
import { cycleInfo } from "@/lib/member";
import { programDay } from "@/lib/program";
import { addDays, formatDate, formatWhen, localParts } from "@/lib/time";

// Καρτέλα μέλους για τους θεραπευτές — όλοι δουλεύουν με όλα τα μέλη.
// Το ημερολόγιο ανάκαμψης και ο δείκτης δεν εμφανίζονται εδώ — τα βλέπει μόνο η Εύα.
export default async function TherapistMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const today = localParts(new Date()).date;
  const from = addDays(today, -27);
  const [cycle, intake, groups, [summary], plan, noteCount] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    prisma.attendance.count({ where: { memberId: id, date: { gte: from } } }),
    caseHistory(id, 1),
    prisma.safetyPlan.findUnique({ where: { memberId: id }, select: { updatedAt: true } }),
    prisma.sessionNote.count({ where: { slot: { bookings: { some: { memberId: id } } } } }),
  ]);
  const riskCheck = intake.checks.find((c) => c.key === "risk");
  const risk = riskCheck?.value as keyof typeof RISK_LEVELS | undefined;
  return (
    <main>
      <h1>{member.name}</h1>
      <SafetyZone memberId={id} />
      <div className="card whereami">
        <div><span className="muted small">Μέρα προγράμματος</span><strong>{programDay(member.programStartDate, today) ?? "—"}</strong></div>
        <div><span className="muted small">Κύκλος</span><strong>{cycle ? `${cycle.done} από ${cycle.length}` : "—"}</strong></div>
        <div><span className="muted small">Ομάδες (4 εβδ.)</span><strong>{groups}</strong></div>
      </div>
      {sp.case && <div className="notice">Η σύνοψη αποθηκεύτηκε ✓</div>}
      <div className="list">
        <Link href={`/t/members/${id}/start`}>
          <span>
            <div>Έναρξη συνεργασίας</div>
            <div className="sub">
              {intake.status.complete ? "Ολοκληρώθηκε" : "Εκκρεμεί"}
              {risk && riskCheck && ` · Κίνδυνος στην αρχική αξιολόγηση (${formatDate(localParts(riskCheck.doneAt).date)}): ${RISK_LEVELS[risk]}`}
            </div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/safety`}>
          <span>
            <div>Πλάνο ασφάλειας</div>
            <div className="sub">{plan ? `Ενημερώθηκε ${formatDate(localParts(plan.updatedAt).date)}` : "Δεν έχει γραφτεί"}</div>
          </span>
        </Link>
        {member.phone && (
          <a href={`tel:${member.phone}`}>
            <span><div>Τηλέφωνο</div><div className="sub">{member.phone}</div></span>
          </a>
        )}
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
