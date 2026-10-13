import Link from "next/link";
import { formatDate, localParts } from "@/lib/time";

/**
 * Σύνοψη προηγούμενου σημειώματος: συντάκτης, ημερομηνία, μικρή προεπισκόπηση του ΥΠΑΡΧΟΝΤΟΣ κειμένου και άνοιγμα.
 * Δεν παράγει ερμηνευτική σύνοψη (χωρίς AI).
 */
export function NoteSummary({ author, at, text, href, label = "Άνοιγμα ολόκληρου" }: { author: string; at: Date | string; text: string; href: string; label?: string }) {
  const preview = text.replace(/\s+/g, " ").trim();
  return (
    <div className="notesum">
      <div className="notesum-head">
        <span className="notesum-meta"><strong>{author}</strong> · {formatDate(typeof at === "string" ? at : localParts(at).date)}</span>
        <Link className="small" href={href}>{label} ›</Link>
      </div>
      {preview ? <p className="notesum-prev">{preview}</p> : <p className="hint" style={{ margin: "6px 0 0" }}>Το σημείωμα δεν έχει κείμενο για προεπισκόπηση.</p>}
    </div>
  );
}
