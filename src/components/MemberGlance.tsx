import Link from "next/link";
import { PresenceStat } from "@/components/ui";
import { isPsychologist } from "@/lib/access";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { PRESENCE_HINT, describeSources } from "@/lib/presence";
import type { sessionGlance } from "@/lib/session-glance";
import { formatDate, formatTime } from "@/lib/time";

type Glance = Awaited<ReturnType<typeof sessionGlance>>;
type Intake = { level: string | null; trigger: unknown; label: string };
type NextClinical = { slotId: string; date: string; startsAt: Date; therapist?: string | null } | null;

const n = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));

/**
 * «Με μια ματιά» ενός μέλους πριν από ατομική ή Therapair (14/10, μετά την παρατήρηση της υπεύθυνης ότι στο Therapair
 * δεν φαινόταν εικόνα και για τα δύο μέλη): ίδιοι αριθμοί παντού — νηφαλιότητα, απογραφές 7 ημερών (λαχτάρα, ύπνος,
 * διάθεση), ατομικές/ομάδες του μήνα, συνέπεια 4 εβδομάδων, ανάγκες ασφάλειας. Φαίνεται ΠΑΝΤΑ, και χωρίς προηγούμενο σημείωμα.
 */
export function MemberGlance({ g, intake, groupsPerCycle, viewer, nextClinical, compact }: {
  g: Glance;
  intake: Intake;
  groupsPerCycle: number;
  viewer: { id: string; role: string; therapistKind: string | null };
  nextClinical?: NextClinical;
  compact?: boolean;
}) {
  const risk = intake.level;
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{g.soberDays ?? "—"}</b><span>μέρες νηφαλιότητας{g.soberSince ? ` · από ${formatDate(g.soberSince)}` : ""}</span></div>
        <div className="stat"><b>{g.journal.written}/7</b><span>απογραφές · 7 ημέρες</span></div>
        <div className="stat"><b>{g.journal.written > 0 ? `${n(g.journal.craving)} / 10` : "—"}</b><span>λαχτάρα · μέσος όρος 7 ημ.</span></div>
        <div className="stat"><b>{g.journal.written > 0 ? `${n(g.journal.sleep)} ώρες` : "—"}</b><span>ύπνος · μέσος όρος 7 ημ.</span></div>
        <div className="stat"><b>{g.journal.written > 0 ? `${n(g.journal.mood)} / 10` : "—"}</b><span>διάθεση · μέσος όρος 7 ημ.</span></div>
        {g.cycle ? (
          <>
            <PresenceStat what={`ατομικές του μήνα (από ${g.cycle.length})`} counted={g.cycle.attended} passed={g.cycle.done} noRecord={g.cycle.presence.noRecord} />
            <PresenceStat what={`ομάδες του μήνα (από ${groupsPerCycle})`} counted={g.cycle.groups} passed={g.cycle.groupsPassed} noRecord={g.cycle.groupsNoRecord} />
          </>
        ) : (
          <div className="stat"><b>—</b><span>δεν έχει ξεκινήσει κύκλος</span></div>
        )}
        <PresenceStat what="ατομικές · 4 εβδομάδες" counted={g.sessions.done} passed={g.sessions.total} noRecord={g.sessions.noRecord} />
        <PresenceStat what="ομάδες · 4 εβδομάδες" counted={g.groups.done} passed={g.groups.total} noRecord={g.groups.noRecord} />
      </div>
      {!compact && <p className="hint" style={{ margin: "10px 0 0" }}>{PRESENCE_HINT}</p>}
      {g.cycle && <p className="hint" style={{ margin: "4px 0 0" }}>{g.cycle.periodLabel} · {g.cycle.booked} από {g.cycle.length} ατομικές προγραμματισμένες{describeSources(g.cycle.presence) && ` · πηγή: ${describeSources(g.cycle.presence)}`}{g.cycle.presence.confirmedAbsent > 0 && ` · ${g.cycle.presence.confirmedAbsent} «Δεν ήρθε» (επιβεβαίωση)`}</p>}
      <p className="hint" style={{ margin: "6px 0 0" }}>
        Ανάγκες ασφάλειας: <strong>{intake.trigger ? intake.label : risk ? RISK_LEVELS[risk as keyof typeof RISK_LEVELS] : "δεν έχει χρειαστεί"}</strong>{!intake.trigger && risk && ` · ${RISK_INFO[risk as keyof typeof RISK_INFO].action}`}
        {g.help14 > 0 && <> · κόκκινο κουμπί {g.help14} {g.help14 === 1 ? "φορά" : "φορές"} σε 14 ημέρες</>}
      </p>
      {Boolean(intake.trigger) && !isPsychologist(viewer) && (
        <p className="hint" style={{ margin: "4px 0 0" }} data-tour="route-psy">
          Την αξιολόγηση την κάνει ψυχολόγος — όχι σε αυτή την ατομική. {nextClinical ? <>Επόμενη ατομική με ψυχολόγο: <Link href={`/t/s/${nextClinical.slotId}`}>{formatDate(nextClinical.date)} {formatTime(nextClinical.startsAt)}{nextClinical.therapist && ` · ${nextClinical.therapist}`}</Link>.</> : <>Δεν έχει προγραμματιστεί ατομική με ψυχολόγο — το βλέπει η διαχείριση στο «Σήμερα» της.</>} Ό,τι δεις σήμερα, γράψ' το στην «Ενημέρωση ομάδας».
        </p>
      )}
    </>
  );
}
