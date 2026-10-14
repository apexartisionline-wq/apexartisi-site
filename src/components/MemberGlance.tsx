import Link from "next/link";
import { PeriodTabs } from "@/components/PeriodTabs";
import { PicturePanel } from "@/components/PicturePanel";
import { isPsychologist } from "@/lib/access";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import type { sessionGlance } from "@/lib/session-glance";
import { formatDate, formatTime } from "@/lib/time";

type Glance = Awaited<ReturnType<typeof sessionGlance>>;
type Intake = { level: string | null; trigger: unknown; label: string };
type NextClinical = { slotId: string; date: string; startsAt: Date; therapist?: string | null } | null;

/**
 * «Με μια ματιά» ενός μέλους πριν από ατομική ή Therapair (14/10): ίδιοι αριθμοί παντού, από την κοινή εικόνα περιόδου
 * (src/lib/picture.ts) — «Εβδομάδα» (τελευταίες 7 ημέρες) / «Μήνας» (ο κύκλος): ατομικές, ομάδες, ημερολόγιο ως αριθμοί,
 * νηφαλιότητα με πηγή· και από κάτω ανάγκες ασφάλειας και κόκκινο κουμπί. Φαίνεται ΠΑΝΤΑ, και χωρίς προηγούμενο σημείωμα.
 * Προηγούμενες εβδομάδες/μήνες: στον φάκελο (εδώ δεν ξαναφορτώνει η σελίδα, για να μη χαθεί σημείωμα).
 */
/** Η οδηγία «την αξιολόγηση την κάνει ψυχολόγος — πού θα γίνει»: πάντα ορατή, δίπλα στην ασφάλεια. */
export function RoutePsy({ intake, viewer, nextClinical }: { intake: Intake; viewer: { id: string; role: string; therapistKind: string | null }; nextClinical?: NextClinical }) {
  if (!intake.trigger || isPsychologist(viewer)) return null;
  return (
    <p className="hint route-psy" data-tour="route-psy">
      Την αξιολόγηση την κάνει ψυχολόγος — όχι σε αυτή την ατομική. {nextClinical ? <>Επόμενη ατομική με ψυχολόγο: <Link href={`/t/s/${nextClinical.slotId}`}>{formatDate(nextClinical.date)} {formatTime(nextClinical.startsAt)}{nextClinical.therapist && ` · ${nextClinical.therapist}`}</Link>.</> : <>Δεν έχει προγραμματιστεί ατομική με ψυχολόγο — το βλέπει η διαχείριση στο «Σήμερα» της.</>} Ό,τι δεις σήμερα, γράψ' το στην «Ενημέρωση ομάδας».
    </p>
  );
}

export function MemberGlance({ g, intake, viewer, nextClinical, compact, memberId }: {
  g: Glance;
  intake: Intake;
  viewer: { id: string; role: string; therapistKind: string | null };
  nextClinical?: NextClinical;
  compact?: boolean;
  memberId?: string;
}) {
  const risk = intake.level;
  const { week, month } = g.pictures;
  return (
    <>
      <PeriodTabs
        weekLabel={week.period.label}
        monthLabel={month.period.label}
        week={<PicturePanel pic={week} compact journalHref={memberId ? `/t/members/${memberId}/journal` : undefined} />}
        month={<PicturePanel pic={month} compact journalHref={memberId ? `/t/members/${memberId}/journal` : undefined} />}
      />
      {memberId && <p className="hint" style={{ margin: "4px 0 0" }}><Link href={`/t/members/${memberId}`}>Προηγούμενες εβδομάδες και μήνες: στον φάκελο ›</Link></p>}
      <p className="hint" style={{ margin: "6px 0 0" }}>
        Ανάγκες ασφάλειας: <strong>{intake.trigger ? intake.label : risk ? RISK_LEVELS[risk as keyof typeof RISK_LEVELS] : "δεν έχει χρειαστεί"}</strong>{!intake.trigger && risk && ` · ${RISK_INFO[risk as keyof typeof RISK_INFO].action}`}
        {g.help14 > 0 && <> · κόκκινο κουμπί {g.help14} {g.help14 === 1 ? "φορά" : "φορές"} σε 14 ημέρες</>}
      </p>
      {!compact && Boolean(intake.trigger) && !isPsychologist(viewer) && (
        <p className="hint" style={{ margin: "4px 0 0" }} data-tour="route-psy">
          Την αξιολόγηση την κάνει ψυχολόγος — όχι σε αυτή την ατομική. {nextClinical ? <>Επόμενη ατομική με ψυχολόγο: <Link href={`/t/s/${nextClinical.slotId}`}>{formatDate(nextClinical.date)} {formatTime(nextClinical.startsAt)}{nextClinical.therapist && ` · ${nextClinical.therapist}`}</Link>.</> : <>Δεν έχει προγραμματιστεί ατομική με ψυχολόγο — το βλέπει η διαχείριση στο «Σήμερα» της.</>} Ό,τι δεις σήμερα, γράψ' το στην «Ενημέρωση ομάδας».
        </p>
      )}
    </>
  );
}
