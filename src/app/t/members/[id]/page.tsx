import Link from "next/link";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { MemberAssignments } from "@/components/MemberAssignments";
import { MemberSessions } from "@/components/MemberSessions";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  const [cycle, intake, groups] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    prisma.attendance.count({ where: { memberId: id, date: { gte: from } } }),
  ]);
  const risk = intake.checks.find((c) => c.key === "risk")?.value as keyof typeof RISK_LEVELS | undefined;
  return (
    <main>
      <h1>{member.name}</h1>
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
      <h2>Ατομικές και σημειώματα</h2>
      <MemberSessions memberId={id} />
      <h2>Εργασίες</h2>
      <MemberAssignments memberId={id} />
    </main>
  );
}
