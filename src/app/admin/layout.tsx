import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";
import { requireNda } from "@/lib/nda";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  await requireStaff2FA(user);
  await requireNda(user); // έντυπο εχεμύθειας (14/10): χωρίς αποδοχή της ισχύουσας έκδοσης, μόνο η σελίδα /nda
  return (
    <>
      <Nav links={navLinks("ADMIN")} menu />
      <main className="wide"><BackButton home="/admin" />{children}</main>
    </>
  );
}
