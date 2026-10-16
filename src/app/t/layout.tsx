import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { NoCopy } from "@/components/NoCopy";
import { SideNav } from "@/components/SideNav";
import { watermarkCss, watermarksNotes, watermarkWhen } from "@/lib/access";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";
import { requireNda } from "@/lib/nda";

export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  await requireStaff2FA(user);
  await requireNda(user); // έντυπο εχεμύθειας (14/10): χωρίς αποδοχή της ισχύουσας έκδοσης, μόνο η σελίδα /nda
  // Υδατογράφημα στα σημειώματα για τους θεραπευτές (απόφαση 13/10, src/lib/access.ts): όνομα + ώρα προβολής.
  const wm = watermarksNotes(user);
  const when = watermarkWhen(new Date());
  const style = wm ? ({ "--wm-l": watermarkCss(user.name, when), "--wm-d": watermarkCss(user.name, when, true) } as React.CSSProperties) : undefined;
  // Πλαϊνό μενού (προσχέδιο υπεύθυνης 14/10) σε μεγάλη οθόνη· από 16/10 και για τη διαχείριση (ίδιο περιβάλλον σε όλους
  // τους ρόλους), με τα δικά της μενού.
  return (
    <div className="has-side">
      <SideNav links={navLinks(user.role)} home={user.role === "ADMIN" ? "/admin" : "/t"} />
      <Nav links={navLinks(user.role)} menu />
      <div className={wm ? "staff wm-scope" : "staff"} style={style}><BackButton home="/t" />{children}</div>
      {wm && <NoCopy name={user.name} />}
    </div>
  );
}
