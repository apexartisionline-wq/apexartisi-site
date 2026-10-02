import { Nav } from "@/components/Nav";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  await requireStaff2FA(user);
  return (
    <>
      <Nav links={navLinks("ADMIN")} />
      <main className="wide">{children}</main>
    </>
  );
}
