import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return (
    <>
      <Nav
        links={[
          { href: "/admin", label: "Σήμερα" },
          { href: "/admin/slots", label: "Θέσεις" },
          { href: "/admin/bookings", label: "Ραντεβού" },
          { href: "/admin/people", label: "Άνθρωποι" },
          { href: "/admin/content", label: "Κείμενα" },
          { href: "/admin/help", label: "Κόκκινο κουμπί" },
          { href: "/admin/settings", label: "Ρυθμίσεις" },
          { href: "/t", label: "Σημειώματα" },
        ]}
      />
      <main className="wide">{children}</main>
    </>
  );
}
