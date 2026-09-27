import Link from "next/link";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { MemberSessions } from "@/components/MemberSessions";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  const [cycle, groups] = await Promise.all([
    cycleInfo(id),
    prisma.attendance.count({ where: { memberId: id, date: { gte: from } } }),
  ]);
  return (
    <main>
      <h1>{member.name}</h1>
      <div className="card whereami">
        <div><span className="muted small">Μέρα προγράμματος</span><strong>{programDay(member.programStartDate, today) ?? "—"}</strong></div>
        <div><span className="muted small">Κύκλος</span><strong>{cycle ? `${cycle.done} από ${cycle.length}` : "—"}</strong></div>
        <div><span className="muted small">Ομάδες (4 εβδ.)</span><strong>{groups}</strong></div>
      </div>
      <p className="small"><Link href={`/t/members/${id}/safety`}>Πλάνο ασφάλειας</Link>{member.phone && <> · Τηλ. <a href={`tel:${member.phone}`}>{member.phone}</a></>}</p>
      <h2>Ατομικές και σημειώματα</h2>
      <MemberSessions memberId={id} />
    </main>
  );
}
