import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { navLinks } from "@/lib/nav";

export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  return (
    <>
      <Nav links={navLinks(user.role)} />
      {children}
    </>
  );
}
