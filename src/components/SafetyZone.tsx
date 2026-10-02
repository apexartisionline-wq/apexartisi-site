import Link from "next/link";
import { memberSafety } from "@/lib/handover";
import { formatDate, localParts } from "@/lib/time";

// Ζώνη ασφαλείας στην κορυφή της καρτέλας μέλους: κανόνες, όχι AI (βλ. handover-rules.ts).
export async function SafetyZone({ memberId }: { memberId: string }) {
  const flags = await memberSafety(memberId);
  if (flags.length === 0) {
    return <div className="card small"><span className="badge ok">Ασφάλεια</span> Δεν υπάρχει ενεργό σήμα.</div>;
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
    </div>
  );
}
