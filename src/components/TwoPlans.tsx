import Link from "next/link";
import { Icon } from "@/components/Icon";

// «Δύο πράγματα, ξεχωριστά» (οδηγία υπεύθυνης, ενότητα 11): στην κορυφή της σελίδας του πλάνου και της
// σελίδας των αναγκών ασφάλειας, ώστε ο θεραπευτής να καταλαβαίνει αμέσως τι είναι τι και πού πάει.
export function TwoPlans({ memberId, here }: { memberId: string; here: "plan" | "risk" }) {
  const plan = `/t/members/${memberId}/safety`;
  const risk = `/t/members/${memberId}/risk`;
  return (
    <div className="panel" style={{ padding: "12px 16px" }}>
      <div className="hint" style={{ fontWeight: 700, marginBottom: 6 }}>Δύο πράγματα, ξεχωριστά</div>
      <div className="linkrow" style={{ padding: "8px 0" }}>
        <span className="iconbox ok"><Icon name="leaf" /></span>
        <div className="grow">
          <strong>Α. Το πλάνο του μέλους όταν δυσκολεύεται</strong>
          <div className="hint">Προσωπικό, πρακτικό πλάνο υποστήριξης και πρόληψης υποτροπής, με τα λόγια του μέλους· γράφεται μαζί στην ατομική. Το βλέπει πρώτο στο κόκκινο κουμπί.</div>
        </div>
        {here === "plan" ? <span className="pill">εδώ</span> : <Link className="btn" href={plan}>Άνοιγμα</Link>}
      </div>
      <div className="linkrow" style={{ padding: "8px 0" }}>
        <span className="iconbox red"><Icon name="shield" /></span>
        <div className="grow">
          <strong>Β. Ανάγκες ασφάλειας και πρωτόκολλο της ομάδας</strong>
          <div className="hint">Κλινική αξιολόγηση όταν υπάρχει λόγος, από ψυχολόγο, με τις ενέργειες ανά επίπεδο και την «Έκτακτη ανάγκη».</div>
        </div>
        {here === "risk" ? <span className="pill">εδώ</span> : <Link className="btn" href={risk}>Άνοιγμα</Link>}
      </div>
    </div>
  );
}
