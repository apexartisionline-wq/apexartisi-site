import Link from "next/link";
import type { AlertBox } from "@/lib/assessment-db";
import { formatTime, formatWhen, localParts } from "@/lib/time";

// Πού πάει κάθε γραμμή: κατευθείαν εκεί που χρειάζεται (σημείωμα, αξιολόγηση, ανάγκες ασφάλειας).
function hrefOf(memberId: string, a: AlertBox["items"][number]): string {
  if (a.source === "NOTE") return `/t/s/${a.kind.split(":")[1] ?? ""}`;
  if (a.source === "ASSESSMENT") return `/t/members/${memberId}/assessment`;
  if (a.source === "RISK") return `/t/members/${memberId}/risk`;
  return `/t/members/${memberId}`;
}

// Σοβαρά σημεία των τελευταίων 24 ωρών: ένα κουτί ανά μέλος (στο «Σήμερα» της ομάδας και της διαχείρισης).
export function AlertBoxes({ boxes }: { boxes: AlertBox[] }) {
  const today = localParts(new Date()).date;
  return (
    <>
      {boxes.map(({ id, items }) => (
        <div key={id} className={`alertbar${items.every((a) => a.mild) ? " yellow" : ""}`} role="alert">
          <Link href={`/t/members/${id}`} style={{ textDecoration: "none" }}><strong>⚑ {items[0].member} ›</strong></Link>
          <ul className="lines small">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={hrefOf(id, a)}><strong>{a.text}</strong></Link> · {a.sourceLabel}, {a.by}, {localParts(a.createdAt).date === today ? formatTime(a.createdAt) : formatWhen(a.createdAt)}
              </li>
            ))}
          </ul>
          {items.some((a) => a.source === "ASSESSMENT") && <div className="small">Μένει στο «Ασφάλεια» του φακέλου</div>}
        </div>
      ))}
    </>
  );
}
