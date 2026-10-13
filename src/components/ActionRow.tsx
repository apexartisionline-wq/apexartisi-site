import { claimAction, completeAction, releaseAction } from "@/app/t/actions";
import { STATE_LABEL, stateLine, type ActionView } from "@/lib/actions-core";
import { formatDate, formatTime, localParts } from "@/lib/time";
import Link from "next/link";
import { Pill } from "./ui";

export type Viewer = { id: string; role: string; therapistKind: string | null };
export type StaffOption = { id: string; name: string; clinician: boolean };

const fmt = (d: Date) => {
  const p = localParts(d);
  return `${formatDate(p.date)} ${formatTime(d)}`;
};
const canClinician = (v: Viewer) => v.role === "ADMIN" || v.therapistKind === "CLINICAL" || v.therapistKind === "BOTH";

/**
 * Γραμμή επόμενης ενέργειας: τι χρειάζεται, ποιος την αναλαμβάνει, πότε δημιουργήθηκε, προθεσμία (αν υπάρχει),
 * κατάσταση (Εκκρεμεί ανάληψη / Έχει αναληφθεί / Ολοκληρώθηκε), και τα κουμπιά που επιτρέπονται στον τρέχοντα χρήστη.
 * Η ανάγνωση της ειδοποίησης δεν ολοκληρώνει την ενέργεια.
 */
export function ActionRow({ a, viewer, staff = [], back, showMember = false, compact = false }: { a: ActionView; viewer: Viewer; staff?: StaffOption[]; back: string; showMember?: boolean; compact?: boolean }) {
  const tone = a.state === "done" ? "ok" : a.state === "claimed" ? "" : "yellow";
  const hidden = (
    <>
      <input type="hidden" name="source" value={a.source} />
      <input type="hidden" name="memberId" value={a.memberId} />
      <input type="hidden" name="kind" value={a.kind} />
      <input type="hidden" name="ref" value={a.ref} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  const mayClaim = a.source !== "help" && a.state === "unclaimed" && (!a.needsClinician || canClinician(viewer));
  const eligible = staff.filter((s) => !a.needsClinician || s.clinician);
  return (
    <div className={`act${compact ? " compact" : ""}`}>
      <div className="act-title">
        <span>{showMember && <><Link href={`/t/members/${a.memberId}`}>{a.memberName}</Link> · </>}{a.title}</span>
        <Pill tone={tone}>{STATE_LABEL[a.state]}</Pill>
      </div>
      <div className="act-meta">
        {a.detail && <>{a.detail} · </>}
        {a.createdAt && <>από {fmt(a.createdAt)} · </>}
        {a.dueAt && <>προθεσμία {formatDate(localParts(a.dueAt).date)} · </>}
        {stateLine(a, fmt)}
      </div>
      <div className="act-forms">
        {(a.source === "help" || !a.manualDone) && <Link className="btn outline sm" href={a.href}>{a.source === "help" && a.state === "unclaimed" ? "Δες και ανάλαβε" : "Άνοιγμα"}</Link>}
        {mayClaim && (
          <form action={claimAction}>
            {hidden}
            <button type="submit" className="primary sm">Το αναλαμβάνω</button>
          </form>
        )}
        {viewer.role === "ADMIN" && a.state !== "done" && a.source !== "help" && eligible.length > 0 && (
          <form action={claimAction}>
            {hidden}
            <select name="assigneeId" aria-label="Ανάθεση σε" defaultValue="">
              <option value="" disabled>Ανάθεση σε…</option>
              {eligible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" name="dueDate" aria-label="Προθεσμία (προαιρετική)" />
            <button type="submit" className="sm">Ανάθεση</button>
          </form>
        )}
        {a.state === "claimed" && a.source !== "help" && (
          <form action={releaseAction}>
            {hidden}
            <button type="submit" className="sm" title="Μόνο όποιος την ανέλαβε ή η διαχείριση">Την αφήνω</button>
          </form>
        )}
        {a.state !== "done" && a.source !== "help" && a.manualDone && (
          <form action={completeAction}>
            {hidden}
            <input name="note" placeholder="σύντομα: τι έγινε" aria-label="Τι έγινε" maxLength={500} />
            <button type="submit" className="sm">Ολοκληρώθηκε</button>
          </form>
        )}
      </div>
    </div>
  );
}
