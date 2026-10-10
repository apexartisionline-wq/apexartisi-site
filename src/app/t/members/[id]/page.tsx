import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { RecentGoals } from "@/components/GoalWeek";
import { MemberAssignments } from "@/components/MemberAssignments";
import { currentStep, lastStepWork } from "@/lib/steps";
import { MemberSessions } from "@/components/MemberSessions";
import { SafetyZone } from "@/components/SafetyZone";
import { auditScore, dastScore, gr, pgsiScore, questionnaires } from "@/lib/assessment";
import { latestAssessment } from "@/lib/assessment-db";
import { requireRole } from "@/lib/auth";
import { soberDays } from "@/lib/note-form";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { caseHistory, memberConsistency } from "@/lib/handover";
import { CASE_FIELDS } from "@/lib/handover-rules";
import { memberIntake } from "@/lib/intake";
import { RISK_INFO } from "@/lib/intake-rules";
import { currentRisk } from "@/lib/risk-db";
import { cycleInfo, cyclePeriod } from "@/lib/member";
import { memberNotes } from "@/lib/member-notes";
import { getSettings } from "@/lib/settings";
import { programDay } from "@/lib/program";
import { addDays, formatDate, formatWhen, localParts } from "@/lib/time";

// Καρτέλα μέλους για τους θεραπευτές — όλοι δουλεύουν με όλα τα μέλη.
// Όλο το ημερολόγιο ανάκαμψης και ο δείκτης δεν εμφανίζονται εδώ — τα βλέπει μόνο η Εύα (οι θεραπευτές βλέπουν τους αριθμούς στη σελίδα της ατομικής).
export default async function TherapistMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const today = localParts(new Date()).date;
  const [cycle, intake, consistency, [summary], plan, noteCount, ax, journal7, step, stepWork, groupMentions] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    memberConsistency(id),
    caseHistory(id, 1),
    prisma.safetyPlan.findUnique({ where: { memberId: id }, select: { updatedAt: true } }),
    memberNotes(id).then((ns) => ns.length),
    latestAssessment(id),
    prisma.journalEntry.count({ where: { memberId: id, date: { gte: addDays(today, -6), lte: today } } }),
    currentStep(id),
    lastStepWork(id),
    // «Προσοχή σε…» από τα σημειώματα ομάδας των τελευταίων 4 εβδομάδων (η φόρμα της ομάδας υπόσχεται ότι φαίνονται εδώ).
    prisma.groupMention.findMany({
      where: { memberId: id, groupSession: { date: { gte: addDays(today, -27) } } },
      include: { groupSession: { select: { date: true, time: true, coordinator: { select: { name: true } } } } },
      orderBy: { groupSession: { date: "desc" } },
    }),
  ]);
  const sober = soberDays(member.soberSince, today);
  const openIncidents = await prisma.incident.count({ where: { memberId: id, closedAt: null } });
  const months = await prisma.cycle.findMany({
    where: { memberId: id },
    orderBy: { startedAt: "asc" },
    select: { id: true, startedAt: true, closedAt: true, bookings: { select: { slot: { select: { date: true } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  const s = await getSettings();
  const q = ax ? questionnaires(ax.data) : null;
  const scores = ax && q
    ? [["AUDIT", auditScore(ax.data.audit)], ["DAST-10", q.dast ? dastScore(ax.data.dast) : null], ["PGSI", q.pgsi ? pgsiScore(ax.data.pgsi) : null]]
        .filter((x): x is [string, NonNullable<ReturnType<typeof auditScore>>] => Boolean(x[1]))
        .map(([n, sc]) => `${n} ${sc.score}`)
    : [];
  const risk = await currentRisk(id);
  const assessment = intake.checks.find((c) => c.key === "assessment");
  const staffNames = new Map(
    (await prisma.user.findMany({ where: { id: { in: [assessment?.doneById].filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href="/t/members">‹ Μέλη</Link></p>
      <h1>{member.name}</h1>
      <div data-tour="safety"><SafetyZone memberId={id} /></div>
      <a className="card step-card" href="#ergasies" data-tour="step">
        <span>
          <strong>{step ? `Βήμα ${step.step}` : "Βήμα: δεν το έχει πει ακόμα"}</strong>
          {step && <span className="muted small"> · το είπε το μέλος, {formatDate(localParts(step.createdAt).date)}</span>}
          <div className="small" style={{ marginTop: 2 }}>
            {stepWork ? <>Γράφει: Βήμα {stepWork.step} · {stepWork.title} · <strong>{stepWork.status}</strong></> : <span className="muted">Δεν έχει σταλεί βήμα από τη διαχείριση.</span>}
          </div>
        </span>
        <span className="muted" aria-hidden="true">›</span>
      </a>
      <div className="card" data-tour="sober">
        <div className="row spread">
          <strong>{member.soberSince ? `Νηφάλιος/α ${sober ?? 0} μέρες` : "Νηφαλιότητα: δεν έχει γραφτεί"}</strong>
          {member.soberSince && <span className="muted small">από {gr(member.soberSince)}</span>}
        </div>
        {ax?.data.summary && (
          <>
            <div className="muted small" style={{ marginTop: 10 }}>Από την αρχική αξιολόγηση · {ax.author}{scores.length > 0 && ` · ${scores.join(" · ")} (περίοδος βαριάς χρήσης)`}</div>
            <div className="body-text">{ax.data.summary}</div>
          </>
        )}
      </div>
      <div className="card" data-tour="consistency">
        <div className="row spread">
          <strong>{cycle ? `Μήνας ${months.length}: ατομικές ήρθε σε ${cycle.attended} από ${cycle.done} που έγιναν (${cycle.length} στον μήνα) · ομάδες ${cycle.groups} από ${s.groupsPerCycle}` : "Δεν έχει ξεκινήσει μήνας"}</strong>
          <span className="muted small">Μέρα {programDay(member.programStartDate, today) ?? "—"} στο πρόγραμμα</span>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>Συνέπεια τις τελευταίες {consistency.weeks} εβδομάδες</div>
        <div>
          Ομάδες: <strong>ήρθε σε {consistency.groups} από {consistency.groupDays.length}</strong>
          {consistency.groupDays.length > 0 && <span className="muted"> ({Math.round((consistency.groups / consistency.groupDays.length) * 100)}%)</span>}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 6 }} aria-label="Παρουσίες στις ομάδες, μέρα με μέρα">
          {consistency.groupDays.map((d) => (
            <span key={d.date} title={`${formatDate(d.date)}: ${d.present ? "ήρθε" : "δεν ήρθε"}`} className={`dot${d.present ? " ok" : ""}`} />
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          Ατομικές: <strong>ήρθε σε {consistency.sessionsDone} από {consistency.sessionsTotal}</strong>
          {consistency.sessionsTotal > consistency.sessionsDone && <span className="muted"> · δεν ήρθε σε {consistency.sessionsTotal - consistency.sessionsDone}</span>}
        </div>
        {groupMentions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Από τις ομάδες («Προσοχή σε…»):</strong>
            <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {groupMentions.map((gm) => (
                <li key={gm.id}>
                  «{dec(gm.text)}» <span className="muted">· <Link href={`/t/group/${gm.groupSession.date}/${gm.groupSession.time.replace(":", "")}`}>{formatDate(gm.groupSession.date)} {gm.groupSession.time}</Link>{gm.groupSession.coordinator && ` · ${gm.groupSession.coordinator.name}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {sp.case && <div className="notice">Η σύνοψη αποθηκεύτηκε ✓</div>}
      <h2 data-tour="clinical">Κλινικός φάκελος</h2>
      <div className="list">
        <Link href={`/t/members/${id}/risk`}>
          <span>
            <div>Ανάγκες ασφάλειας: <strong>{risk.label}</strong></div>
            <div className="sub">
              {risk.trigger ? `μετά από ${risk.trigger.text} · ψυχολόγος` : risk.level && risk.at ? `${RISK_INFO[risk.level].action} · ${formatDate(localParts(risk.at).date)}, ${risk.author}` : "Μόνο όταν υπάρχει λόγος · ψυχολόγος"}
            </div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/journal`}>
          <span>
            <div>Απογραφές (ημερολόγιο ανάκαμψης)</div>
            <div className="sub">Έγραψε {journal7} από 7 τις τελευταίες 7 μέρες · όλες οι απαντήσεις, μέρα-μέρα</div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/safety`}>
          <span>
            <div>Πλάνο ασφάλειας</div>
            <div className="sub">{plan ? `Ενημερώθηκε ${formatDate(localParts(plan.updatedAt).date)}` : "Δεν έχει γραφτεί"}</div>
          </span>
        </Link>
        <Link href={`/t/members/${id}/assessment`}>
          <span>
            <div>Αρχική αξιολόγηση</div>
            <div className="sub">{assessment && ax?.complete ? `✓ ${formatDate(localParts(assessment.doneAt).date)}, ${staffNames.get(assessment.doneById) ?? ""}` : ax ? `Σε εξέλιξη · ${ax.author}` : "Δεν έχει γίνει ακόμα — την κάνει ψυχολόγος στην επόμενη ατομική"}</div>
          </span>
        </Link>
      </div>
      <h2 data-tour="goals">Στόχοι εβδομάδας</h2>
      <RecentGoals memberId={id} today={today} />
      <h2 data-tour="months">Μήνες</h2>
      <div className="list">
        <Link href={`/t/members/${id}/cycle`}><span>Ανασκόπηση τελευταίου κύκλου</span></Link>
        {months.map((c, i) => (
          <Link key={c.id} href={`/t/members/${id}/month/${c.id}`}><span>Μήνας {i + 1} <span className="muted small">· από {formatDate(cyclePeriod(c).from)}</span></span></Link>
        )).reverse()}
      </div>
      <div className="list">
        <Link href={`/t/members/${id}/incident`}><span>Συμβάντα{openIncidents > 0 && <span className="badge yellow" style={{ marginLeft: 6 }}>{openIncidents} {openIncidents === 1 ? "ανοιχτό" : "ανοιχτά"}</span>}</span></Link>
      </div>
      <h2>Σύνοψη περίπτωσης</h2>
      <div className="card">
        {summary ? (
          <>
            {CASE_FIELDS.filter((f) => summary.data[f.key]).map((f) => (
              <div key={f.key} style={{ marginBottom: 8 }}>
                <div className="muted small">{f.label}</div>
                <div className="body-text">{summary.data[f.key]}</div>
              </div>
            ))}
            <div className="row spread small">
              <span className="muted">{summary.author} · {formatWhen(summary.at)}</span>
              <Link href={`/t/members/${id}/case`}>Ενημέρωση / ιστορικό</Link>
            </div>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Δεν έχει γραφτεί ακόμα. <Link href={`/t/members/${id}/case`}>Γράψε τη σύνοψη</Link>
          </p>
        )}
      </div>
      <h2 data-tour="notes">Ατομικές και σημειώματα</h2>
      <div className="list">
        <Link href={`/t/members/${id}/notes`}><span>Όλα τα σημειώματα ({noteCount}), με φίλτρα</span></Link>
      </div>
      <p className="muted small" style={{ margin: "4px 0 0" }}>Οι 5 πιο πρόσφατες (μαζί με τις προγραμματισμένες)· πάτα μία για να ανοίξει το σημείωμα.</p>
      <MemberSessions memberId={id} limit={5} />
      <h2 id="ergasies">Βήματα και εργασίες</h2>
      <MemberAssignments memberId={id} />
      <TourFor id="member" userId={user.id} />
    </main>
  );
}
