import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { navLinks } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return (
    <>
      <Nav links={navLinks("ADMIN")} />
      <main className="wide">{children}</main>
    </>
  );
}
