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
import { addDays, localParts } from "@/lib/time";

// Καρτέλα μέλους για τους θεραπευτές — όλοι δουλεύουν με όλα τα μέλη.
// Το ημερολόγιο ανάκαμψης και ο δείκτης δεν εμφανίζονται εδώ — τα βλέπει μόνο η Εύα.
export default async function TherapistMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const today = localParts(new Date()).date;
  const from = addDays(today, -27);
  const [cycle, intake, groups, [summary]] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    prisma.attendance.count({ where: { memberId: id, date: { gte: from } } }),
    caseHistory(id, 1),
  ]);
  const risk = intake.checks.find((c) => c.key === "risk")?.value as keyof typeof RISK_LEVELS | undefined;
  return (
    <main>
      <h1>{member.name}</h1>
      <SafetyZone memberId={id} />
      <div className="card whereami">
        <div><span className="muted small">Μέρα προγράμματος</span><strong>{programDay(member.programStartDate, today) ?? "—"}</strong></div>
        <div><span className="muted small">Κύκλος</span><strong>{cycle ? `${cycle.done} από ${cycle.length}` : "—"}</strong></div>
        <div><span className="muted small">Ομάδες (4 εβδ.)</span><strong>{groups}</strong></div>
      </div>
      <p className="small">
        <Link href={`/t/members/${id}/start`}>Έναρξη συνεργασίας</Link>{" "}
        {intake.status.complete ? "✓" : <strong>(εκκρεμεί)</strong>}
        {risk && <> · Κίνδυνος: <strong>{RISK_LEVELS[risk]}</strong></>}
      </p>
      <p className="small"><Link href={`/t/members/${id}/safety`}>Πλάνο ασφάλειας</Link>{member.phone && <> · Τηλ. <a href={`tel:${member.phone}`}>{member.phone}</a></>}</p>
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
              <span className="muted">{summary.author} · {summary.at.toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</span>
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
      <p className="small"><Link href={`/t/members/${id}/notes`}>Όλα τα σημειώματα, με φίλτρα</Link></p>
      <MemberSessions memberId={id} limit={5} />
      <h2>Εργασίες</h2>
      <MemberAssignments memberId={id} />
    </main>
  );
}
