import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireRole("MEMBER");
  return (
    <>
      <Nav
        links={[
          { href: "/m", label: "Σήμερα" },
          { href: "/m/book", label: "Ραντεβού" },
          { href: "/m/journal", label: "Ημερολόγιο" },
          { href: "/m/texts", label: "Κείμενα" },
        ]}
      />
      {children}
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
