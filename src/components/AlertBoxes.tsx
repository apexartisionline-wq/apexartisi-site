import Link from "next/link";
import { ALERT_SOURCE, type AlertBox } from "@/lib/assessment-db";
import { formatTime, formatWhen, localParts } from "@/lib/time";

// Σοβαρά σημεία των τελευταίων 24 ωρών: ένα κουτί ανά μέλος (στο «Σήμερα» της ομάδας και της διαχείρισης).
export function AlertBoxes({ boxes }: { boxes: AlertBox[] }) {
  const today = localParts(new Date()).date;
  return (
    <>
      {boxes.map(({ id, items }) => (
        <Link key={id} href={`/t/members/${id}`} className={`alertbar${items.every((a) => a.mild) ? " yellow" : ""}`} role="alert" style={{ display: "block", textDecoration: "none" }}>
          <strong>⚑ {items[0].member}</strong>
          <ul className="lines small">
            {items.map((a) => (
              <li key={a.id}>
                <strong>{a.text}</strong> · {ALERT_SOURCE[a.source] ?? ""}, {a.by}, {localParts(a.createdAt).date === today ? formatTime(a.createdAt) : formatWhen(a.createdAt)}
              </li>
            ))}
          </ul>
          {items.some((a) => a.source === "ASSESSMENT") && <div className="small">Μένει στο «Ασφάλεια» του φακέλου</div>}
        </Link>
      ))}
    </>
  );
}
