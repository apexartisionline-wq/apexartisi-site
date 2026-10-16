import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("MEMBER");
  // Ο κωδικός ήρθε με email (16/10): πριν από οτιδήποτε άλλο, το μέλος βάζει δικό του κωδικό.
  if (user.mustChangeCode) redirect("/account?first=1");
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
      {/* Ίδιο φόντο, κάρτες και επικεφαλίδες με το περιβάλλον της ομάδας (16/10)· χωρίς το πλαϊνό μενού (έχει το λεκτικό
          «apex/rtisi», που δεν φτάνει στο κινητό των μελών — μόνο το ουδέτερο «Apex»). */}
      <div className="member-env">
        <BackButton home="/m" />
        {children}
      </div>
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
