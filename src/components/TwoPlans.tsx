import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/ui";

// Τι υποστηρίζει η εφαρμογή, ξεχωριστά (13/10): το προσωπικό πλάνο υποστήριξης του μέλους, η αξιολόγηση αναγκών ασφάλειας,
// το πρωτόκολλο ενεργειών της ομάδας και — αν υπάρχει — το εξατομικευμένο κλινικό πλάνο. Δεν παρουσιάζονται ως ισοδύναμα.
// Στην κορυφή της σελίδας του πλάνου και της σελίδας των αναγκών ασφάλειας.
export function TwoPlans({ memberId, here }: { memberId: string; here: "plan" | "risk" }) {
  const plan = `/t/members/${memberId}/safety`;
  const risk = `/t/members/${memberId}/risk`;
  const row = (icon: string, tone: string, title: string, text: string, right: React.ReactNode) => (
    <div className="linkrow" style={{ padding: "8px 0" }}>
      <span className={`iconbox ${tone}`} style={{ width: 36, height: 36 }}><Icon name={icon} size={18} /></span>
      <div className="grow"><strong>{title}</strong><div className="hint">{text}</div></div>
      {right}
    </div>
  );
  return (
    <div className="panel" style={{ padding: "10px 18px" }}>
      <div className="hint" style={{ fontWeight: 700, marginBottom: 2 }}>Ξεχωριστά πράγματα</div>
      {row("leaf", "ok", "Πλάνο υποστήριξης του μέλους", "Προσωπικό, με τα λόγια του μέλους. Το βλέπει πρώτο στο κόκκινο κουμπί.",
        here === "plan" ? <Pill>εδώ</Pill> : <Link className="btn outline sm" href={plan}>Άνοιγμα</Link>)}
      {row("shield", "red", "Αξιολόγηση αναγκών ασφάλειας", "Κλινική αξιολόγηση από ψυχολόγο, όταν υπάρχει λόγος. Δεν είναι κλινικό πλάνο.",
        here === "risk" ? <Pill>εδώ</Pill> : <Link className="btn outline sm" href={risk}>Άνοιγμα</Link>)}
      {row("list", "", "Πρωτόκολλο ενεργειών της ομάδας", "Τι κάνουμε σε κάθε επίπεδο· ίδιο για όλους.", <Link className="btn outline sm" href={`${risk}#protocol`}>Άνοιγμα</Link>)}
      {row("doc", "yellow", "Εξατομικευμένο κλινικό πλάνο", "Δεν υπάρχει ακόμα στην εφαρμογή· θα σχεδιαστεί με τον αρμόδιο ψυχολόγο. Μέχρι τότε ισχύουν οι υπάρχουσες κλινικές καταγραφές και το πρωτόκολλο.", <Pill tone="yellow">εκκρεμεί σχεδιασμός</Pill>)}
    </div>
  );
}
