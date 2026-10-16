import Link from "next/link";
import { memberSafety } from "@/lib/handover";
import { loadMemberActions } from "@/lib/actions";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { formatDate, localParts } from "@/lib/time";
import { ActionRow, type StaffOption, type Viewer } from "./ActionRow";
import { Icon } from "./Icon";
import { RoutePsy } from "./MemberGlance";
import { Pill } from "./ui";

type Flags = Awaited<ReturnType<typeof memberSafety>>;
type Intake = { level: string | null; trigger: unknown; label: string };
type NextClinical = { slotId: string; date: string; startsAt: Date; therapist?: string | null } | null;

/**
 * «Πριν ξεκινήσεις» (16/10, ανασχεδιασμός της ατομικής): η ασφάλεια σε ΟΛΟ το πλάτος, πάνω από τα βήματα και το
 * σημειωματάριο — όχι πια σε στενή δεξιά στήλη. Κάθε ενεργό σήμα φαίνεται ΟΛΟΚΛΗΡΟ (ποτέ μέσα σε αναδιπλούμενο),
 * με επίπεδο σε λέξη και εικονίδιο (όχι μόνο χρώμα), ημερομηνία, την αιτία όπως τη γράφει ο κανόνας, και «Άνοιγμα σήματος»
 * προς το στοιχείο του, με το πού πηγαίνει στο κουμπί. Από κάτω το επόμενο βήμα: ό,τι λέει ήδη η εφαρμογή (επίπεδο αναγκών → τι κάνουμε, ανοιχτές
 * ενέργειες με ποιος τις έχει, «την αξιολόγηση την κάνει ψυχολόγος — πού»).
 * ΙΔΙΟΙ κανόνες και ίδια δεδομένα με το SafetyZone (handover-rules.ts, actions.ts): τίποτα παραπάνω για κανέναν ρόλο.
 * Οι σύνδεσμοι πάνε μόνο σε σελίδες που ελέγχουν μόνες τους ποιος τις βλέπει (π.χ. αξιολόγηση: μόνο ψυχολόγος).
 */
export async function BeforeStart({ memberId, viewer, staff = [], back, flags, intake, nextClinical, who }: {
  memberId: string; viewer: Viewer; staff?: StaffOption[]; back: string; flags: Flags; intake: Intake; nextClinical: NextClinical; who?: string;
}) {
  const red = flags.some((f) => f.level === "red");
  const level = intake.level as keyof typeof RISK_LEVELS | null;
  const levelLine = !intake.trigger && level ? `${RISK_LEVELS[level]} — ${RISK_INFO[level].action}` : null;
  // Σήμα χωρίς δικό του σύνδεσμο (π.χ. κόκκινο κουμπί, επίπεδο αναγκών, «Χωρίς επαφή»): η καρτέλα «Ασφάλεια» του φακέλου.
  const linkOf = (f: Flags[number]) => (f.href === "safety" ? `/t/members/${memberId}/safety` : f.href || `/t/members/${memberId}/risk`);
  // Το κουμπί λέει ΠΟΥ πηγαίνει (υπεύθυνη 16/10: «τι σημαίνει το Άνοιγμα σήματος; το πατάω και δεν ανοίγει» — το σήμα
  // «Χωρίς καταγραφή» έδειχνε την ίδια αυτή ατομική, οπότε ξαναφόρτωνε την ίδια σελίδα). Σήμα αυτής της ατομικής → κάτω στο
  // σημειωματάριο, όπου γράφεται «Ήρθε / Δεν ήρθε».
  const target = (f: Flags[number]): { href: string; label: string; here?: boolean } => {
    const href = linkOf(f);
    if (href === back) return { href: "#notebook-top", label: "Στο σημειωματάριο ↓", here: true };
    if (href.startsWith("/t/s/")) return { href, label: "Άνοιγμα εκείνης της ατομικής" };
    if (href.endsWith("/assessment")) return { href, label: "Αρχική αξιολόγηση" };
    if (href.endsWith("/risk")) return { href, label: "Ανάγκες ασφάλειας" };
    if (href.endsWith("/safety")) return { href, label: "Ασφάλεια στον φάκελο" };
    return { href, label: "Στον φάκελο" };
  };
  const title = who ? <>Πριν ξεκινήσεις <span className="bs-who">· {who}</span></> : "Πριν ξεκινήσεις";

  if (flags.length === 0) {
    return (
      <section className="panel before-start clear" aria-labelledby={`bs-${memberId}`} data-tour="safety">
        <div className="bs-row">
          <span className="iconbox ok"><Icon name="shield" size={20} /></span>
          <div className="bs-main">
            <h2 id={`bs-${memberId}`} className="bs-title">{title}</h2>
            <p className="bs-clear-text"><strong>Δεν υπάρχει ενεργό σήμα.</strong> <span className="muted">Ανάγκες ασφάλειας: {level ? RISK_LEVELS[level] : "δεν έχει χρειαστεί αξιολόγηση"}.</span></p>
            <RoutePsy intake={intake} viewer={viewer} nextClinical={nextClinical} />
          </div>
          <Link className="btn outline sm bs-open" href={`/t/members/${memberId}/risk`}>Ασφάλεια στον φάκελο</Link>
        </div>
      </section>
    );
  }

  const actions = (await loadMemberActions(memberId, "", flags)).filter((a) => a.state !== "done");
  return (
    <section className={`panel before-start ${red ? "red" : "yellow"}`} aria-labelledby={`bs-${memberId}`} data-tour="safety">
      <div className="bs-head">
        <span className={`iconbox ${red ? "red" : "yellow"}`}><Icon name={red ? "alert" : "info"} size={20} /></span>
        <h2 id={`bs-${memberId}`} className="bs-title">{title}</h2>
        <Pill tone={red ? "red" : "yellow"} icon={red ? "alert" : "info"}>{red ? "Χρειάζεται προσοχή σήμερα" : "Να το δεις"}</Pill>
      </div>
      <ul className="bs-flags">
        {flags.map((f, i) => (
          <li key={f.key ?? i} className={f.level}>
            <span className="bs-level"><Icon name={f.level === "red" ? "alert" : "info"} size={16} />{f.level === "red" ? "Σοβαρό" : "Να το δεις"}</span>
            <span className="bs-text">
              {f.text}
              {f.at && <span className="bs-date"> · {formatDate(localParts(f.at).date)}</span>}
            </span>
            {(() => {
              const t = target(f);
              return t.here
                ? <a className="btn outline sm" href={t.href}>{t.label}</a>
                : <Link className="btn outline sm" href={t.href}>{t.label} <Icon name="chevron" size={16} /></Link>;
            })()}
          </li>
        ))}
      </ul>
      {(levelLine || actions.length > 0 || Boolean(intake.trigger)) && (
        <div className="bs-next">
          <h3>Επόμενο βήμα</h3>
          {levelLine && <p className="bs-level-line">Ανάγκες ασφάλειας: <strong>{levelLine}</strong></p>}
          <RoutePsy intake={intake} viewer={viewer} nextClinical={nextClinical} />
          {actions.map((a) => <ActionRow key={a.key} a={a} viewer={viewer} staff={staff} back={back} compact />)}
        </div>
      )}
    </section>
  );
}
