import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("MEMBER");
  const hasPlan = Boolean(await prisma.safetyPlan.findUnique({ where: { memberId: user.id }, select: { memberId: true } }));
  return (
    <>
      <Nav links={navLinks("MEMBER", { hasPlan })} />
      {children}
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
