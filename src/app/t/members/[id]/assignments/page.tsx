import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound } from "next/navigation";
import { MemberAssignments } from "@/components/MemberAssignments";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentStep } from "@/lib/steps";
import { formatDate, localParts } from "@/lib/time";

// Βήματα και εργασίες του μέλους (καρτέλα «Εργασίες» του φακέλου, 13/10).
export default async function MemberAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const step = await currentStep(id);
  return (
    <main className="wide">
      <p className="crumbs"><Link href="/t/members">Μέλη</Link> <span>/</span> <Link href={`/t/members/${id}`}>{member.name}</Link> <span>/</span> <span>Εργασίες</span></p>
      <FolderTabs memberId={id} active="assignments" />
      <h1 style={{ marginBottom: 4 }}>Βήματα και εργασίες</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {step ? <>Βήμα {step.step} <span className="small">· το είπε το μέλος, {formatDate(localParts(step.createdAt).date)}</span></> : "Το μέλος δεν έχει πει ακόμα σε ποιο βήμα βρίσκεται."}
        {" · "}Τα βήματα τα στέλνει η διαχείριση· εδώ βλέπεις τι έγραψε.
      </p>
      <MemberAssignments memberId={id} />
    </main>
  );
}
