import Link from "next/link";
import { memberSafety } from "@/lib/handover";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { formatDate, localParts } from "@/lib/time";

// Ζώνη ασφάλειας στην κορυφή της καρτέλας μέλους: κανόνες, όχι AI (βλ. handover-rules.ts).
export async function SafetyZone({ memberId }: { memberId: string }) {
  const flags = await memberSafety(memberId);
  if (flags.length === 0) {
    return (
      <div className="card small">
        <span className="badge ok">Ασφάλεια</span> Κανένα ανοιχτό σήμα.
        <Explain />
      </div>
    );
  }
  return (
    <div className="card" style={{ borderColor: flags[0].level === "red" ? "var(--red)" : "var(--yellow)" }}>
      <strong>Ασφάλεια</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {flags.map((f, i) => {
          const href = f.href === "safety" ? `/t/members/${memberId}/safety` : f.href;
          return (
            <li key={i} className="small" style={{ marginBottom: 4 }}>
              <span className={`badge ${f.level}`}>{f.level === "red" ? "!" : "·"}</span>{" "}
              {href ? <Link href={href}>{f.text}</Link> : f.text}
              {f.at && <span className="muted"> · {formatDate(localParts(f.at).date)}</span>}
            </li>
          );
        })}
      </ul>
      <Explain />
    </div>
  );
}

// Σύντομη εξήγηση: τι σημαίνουν τα επίπεδα και τα χρώματα.
function Explain() {
  return (
    <details className="small" style={{ marginTop: 8 }}>
      <summary>Τι σημαίνουν</summary>
      <p style={{ margin: "6px 0" }}>
        Οι «ανάγκες ασφάλειας» αφορούν αυτοτραυματισμό, υποτροπή και υπερδοσολογία. Δεν είναι πρόβλεψη· λένε τι χρειάζεται το μέλος από εμάς τώρα.
      </p>
      {Object.entries(RISK_INFO).map(([k, v]) => (
        <p key={k} style={{ margin: "6px 0" }}>
          <strong>{RISK_LEVELS[k as keyof typeof RISK_LEVELS]}:</strong> {v.means} <span className="muted">→ {v.action}</span>
        </p>
      ))}
      <p className="muted" style={{ margin: "6px 0" }}>
        Κόκκινο: χρειάζεται ενέργεια σήμερα. Κίτρινο: να το δεις στην επόμενη επαφή. Τα σήματα βγαίνουν αυτόματα από το κόκκινο κουμπί, τα σημειώματα, τις παρουσίες και τον κλινικό φάκελο.
      </p>
    </details>
  );
}
