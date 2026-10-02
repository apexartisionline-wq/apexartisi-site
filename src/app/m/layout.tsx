import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { navLinks } from "@/lib/nav";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireRole("MEMBER");
  return (
    <>
      <Nav links={navLinks("MEMBER")} />
      {children}
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
