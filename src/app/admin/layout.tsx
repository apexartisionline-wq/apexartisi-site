import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { SideNav } from "@/components/SideNav";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";
import { requireNda } from "@/lib/nda";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  await requireStaff2FA(user);
  await requireNda(user); // έντυπο εχεμύθειας (14/10): χωρίς αποδοχή της ισχύουσας έκδοσης, μόνο η σελίδα /nda
  // Ίδιο περιβάλλον με τον θεραπευτή (16/10): πλαϊνό μενού σε μεγάλη οθόνη, φόντο και κάρτες του .staff.
  return (
    <div className="has-side">
      <SideNav links={navLinks("ADMIN")} home="/admin" />
      <Nav links={navLinks("ADMIN")} menu />
      <div className="staff live xr-foto"><main className="wide"><BackButton home="/admin" />{children}</main></div>
    </div>
  );
}
