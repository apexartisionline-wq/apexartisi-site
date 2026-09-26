import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";

export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  await requireRole("THERAPIST", "ADMIN");
  return (
    <>
      <Nav links={[{ href: "/t", label: "Το πρόγραμμά μου" }]} />
      {children}
    </>
  );
}
