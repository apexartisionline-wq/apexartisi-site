import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("MEMBER");
  const [plan, monthly, closure] = await Promise.all([
    prisma.safetyPlan.findUnique({ where: { memberId: user.id }, select: { memberId: true } }),
    prisma.monthlyMessage.findFirst({ where: { memberId: user.id, sentAt: { not: null } }, select: { id: true } }),
    prisma.closure.findFirst({ where: { memberId: user.id, sentAt: { not: null } }, select: { id: true } }),
  ]);
  const hasPlan = Boolean(plan);
  const hasMessages = Boolean(monthly || closure);
  return (
    <>
      <Nav links={navLinks("MEMBER", { hasPlan, hasMessages })} />
      {children}
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
