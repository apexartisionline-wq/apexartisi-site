import { Nav } from "@/components/Nav";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";

export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  await requireStaff2FA(user);
  return (
    <>
      <Nav links={navLinks(user.role)} />
      {children}
    </>
  );
}
