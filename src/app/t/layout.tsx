import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { NoCopy } from "@/components/NoCopy";
import { SideNav } from "@/components/SideNav";
import { watermarkCss, watermarksNotes, watermarkWhen } from "@/lib/access";
import { requireRole, requireStaff2FA } from "@/lib/auth";
import { navLinks } from "@/lib/nav";
import { requireNda } from "@/lib/nda";
import { NoteGate } from "@/components/NoteGate";
import { therapistNoteGate } from "@/lib/note-gate";
import { formatDate, formatTime, localParts } from "@/lib/time";

export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  await requireStaff2FA(user);
  await requireNda(user); // έντυπο εχεμύθειας (14/10): χωρίς αποδοχή της ισχύουσας έκδοσης, μόνο η σελίδα /nda
  // Υδατογράφημα στα σημειώματα για τους θεραπευτές (απόφαση 13/10, src/lib/access.ts): όνομα + ώρα προβολής.
  const wm = watermarksNotes(user);
  const when = watermarkWhen(new Date());
  const style = wm ? ({ "--wm-l": watermarkCss(user.name, when), "--wm-d": watermarkCss(user.name, when, true) } as React.CSSProperties) : undefined;
  // Πύλη «Εκκρεμεί σημείωμα» (υπεύθυνη 17/10): συνεδρία που τελείωσε χωρίς σημείωμα κλειδώνει τον θεραπευτή στο Apex
  // μέχρι να το γράψει (εξαίρεση όσο τρέχει άλλη συνεδρία/ομάδα του). Μόνο θεραπευτές· η διαχείριση βλέπει τη λίστα στο «Σήμερα» της.
  const gate = await therapistNoteGate(user).catch((e) => { console.error("[note-gate]", e); return { pending: [], blocked: false }; });
  const gateItems = gate.blocked ? gate.pending.map((pn) => ({ id: pn.id, href: `/t/s/${pn.id}#notebook-top`, when: `${formatDate(localParts(pn.startsAt).date)} ${formatTime(pn.startsAt)}`, who: pn.who, kind: pn.kind === "PAIR" ? "Therapair" : "Ατομική" })) : [];
  // Πλαϊνό μενού (προσχέδιο υπεύθυνης 14/10) σε μεγάλη οθόνη· από 16/10 και για τη διαχείριση (ίδιο περιβάλλον σε όλους
  // τους ρόλους), με τα δικά της μενού.
  return (
    <div className="has-side">
      <SideNav links={navLinks(user.role)} home={user.role === "ADMIN" ? "/admin" : "/t"} />
      <Nav links={navLinks(user.role)} menu />
      <div className={wm ? "staff wm-scope" : "staff"} style={style}><BackButton home="/t" />{children}</div>
      {wm && <NoCopy name={user.name} />}
      <NoteGate items={gateItems} />
    </div>
  );
}
