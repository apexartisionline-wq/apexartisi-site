import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { FolderTabs } from "@/components/FolderTabs";
import { Icon } from "@/components/Icon";
import { ActionRow, type StaffOption } from "@/components/ActionRow";
import { NoteSummary } from "@/components/NoteSummary";
import { EmptyState, PageHead, Panel, Pill, PresenceStat } from "@/components/ui";
import { notFound } from "next/navigation";
import { isPsychologist, nameWithKind, seesJournalDetail, seesMonthFolder } from "@/lib/access";
import { logAccess } from "@/lib/audit";
import { currentStep, lastStepWork } from "@/lib/steps";
import { SafetyZone } from "@/components/SafetyZone";
import { auditScore, dastScore, gr, pgsiScore, questionnaires } from "@/lib/assessment";
import { latestAssessment } from "@/lib/assessment-db";
import { requireRole } from "@/lib/auth";
import { soberDays } from "@/lib/note-form";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { recentGoals } from "@/lib/goals";
import { caseHistory, memberConsistency, memberSafety } from "@/lib/handover";
import { loadMemberActions, recentlyDone } from "@/lib/actions";
import { describeCounts, describeSources, PRESENCE_HINT } from "@/lib/presence";
import { describeGroups } from "@/lib/group-presence";
import { CASE_FIELDS } from "@/lib/handover-rules";
import { memberIntake } from "@/lib/intake";
import { RISK_INFO } from "@/lib/intake-rules";
import { currentRisk } from "@/lib/risk-db";
import { lastFinishedCycle } from "@/lib/cycle-review";
import { cycleInfo, cyclePeriod } from "@/lib/member";
import { memberNotes } from "@/lib/member-notes";
import { getSettings } from "@/lib/settings";
import { programDay } from "@/lib/program";
import { addDays, formatDate, formatTime, formatWhen, localParts, mondayOf } from "@/lib/time";

// Καρτέλα μέλους «Με μια ματιά» (13/10): επισκόπηση που διαβάζεται σε ένα λεπτό — όλοι δουλεύουν με όλα τα μέλη.
// Τηλέφωνα, διευθύνσεις και συγκαταθέσεις δεν φαίνονται εδώ (μόνο η διαχείριση).
export default async function TherapistMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "member_file_view");
  const now = new Date();
  const today = localParts(now).date;
  const [cycle, intake, consistency, [summary], plan, notes, ax, journal7, step, stepWork, groupMentions, nextBooking, careOpen, helpOpen, s, goals, finished, months, openIncidents] = await Promise.all([
    cycleInfo(id),
    memberIntake(member),
    memberConsistency(id, 4, now),
    caseHistory(id, 1),
    prisma.safetyPlan.findUnique({ where: { memberId: id }, select: { updatedAt: true } }),
    memberNotes(id, { take: 1 }),
    latestAssessment(id),
    prisma.journalEntry.count({ where: { memberId: id, date: { gte: addDays(today, -6), lte: today } } }),
    currentStep(id),
    lastStepWork(id),
    prisma.groupMention.findMany({
      where: { memberId: id, groupSession: { date: { gte: addDays(today, -27) } } },
      include: { groupSession: { select: { date: true, time: true, coordinator: { select: { name: true } } } } },
      orderBy: { groupSession: { date: "desc" } },
    }),
    prisma.booking.findFirst({ where: { memberId: id, slot: { startsAt: { gt: now } } }, include: { slot: { include: { therapist: { select: { name: true } } } } }, orderBy: { slot: { startsAt: "asc" } } }),
    prisma.careTask.findMany({ where: { memberId: id, doneAt: null }, orderBy: { dueAt: "asc" } }),
    prisma.helpRequest.findFirst({ where: { memberId: id, isDrill: false, resolvedAt: null, talkedAt: null }, orderBy: { createdAt: "desc" } }),
    getSettings(),
    recentGoals(id, today, 8),
    lastFinishedCycle(id, now),
    prisma.cycle.count({ where: { memberId: id } }),
    prisma.incident.count({ where: { memberId: id, closedAt: null } }),
  ]);
  const [risk, reviewDone, noteCount] = await Promise.all([
    currentRisk(id),
    finished ? prisma.cycleReview.findFirst({ where: { cycleId: finished.id }, select: { id: true } }) : Promise.resolve(null),
    memberNotes(id).then((ns) => ns.length),
  ]);
  const sober = soberDays(member.soberSince, today);
  const last = notes[0] ?? null;
  const h = last?.handover;
  const q = ax ? questionnaires(ax.data) : null;
  const scores = ax && q
    ? [["AUDIT", auditScore(ax.data.audit)], ["DAST-10", q.dast ? dastScore(ax.data.dast) : null], ["PGSI", q.pgsi ? pgsiScore(ax.data.pgsi) : null]]
        .filter((x): x is [string, NonNullable<ReturnType<typeof auditScore>>] => Boolean(x[1]))
        .map(([n, sc]) => `${n} ${sc.score}`)
    : [];
  const assessment = intake.checks.find((c) => c.key === "assessment");
  const lastGoal = goals[0] ?? null;
  const period = cycle ? cyclePeriod(cycle.cycle) : null;
  const day = programDay(member.programStartDate, today);

  // Επόμενες ενέργειες: τι χρειάζεται, ποιος την αναλαμβάνει, πότε δημιουργήθηκε, κατάσταση, ποιος/πότε την ολοκλήρωσε.
  const flags = await memberSafety(id);
  const [openActions, doneRecently, staffRows] = await Promise.all([
    loadMemberActions(id, member.name, flags, { now }).then((l) => l.filter((a) => a.state !== "done")),
    recentlyDone(id, now),
    user.role === "ADMIN" ? prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true, name: true, therapistKind: true, role: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const viewer = { id: user.id, role: user.role, therapistKind: user.therapistKind };
  const staff: StaffOption[] = staffRows.map((u) => ({ id: u.id, name: u.name, clinician: u.role === "ADMIN" || u.therapistKind === "CLINICAL" || u.therapistKind === "BOTH", admin: u.role === "ADMIN" }));

  return (
    <main className="wide">
      <PageHead
        crumbs={[{ href: "/t/members", label: "Μέλη" }, { label: "Καρτέλα μέλους" }]}
        title={member.name}
        sub={<>
          {day ? `${day}η μέρα στο πρόγραμμα` : "Η έναρξη δεν έχει ημερομηνία ακόμα"} · {cycle ? `Μήνας ${months}` : "χωρίς κύκλο ακόμα"}
          {step && <> · Βήμα {step.step} <span className="small">(το είπε το μέλος, {formatDate(localParts(step.createdAt).date)})</span></>}
        </>}
      >
        {nextBooking ? (
          <div className="panel nextcard">
            <span className="iconbox"><Icon name="calendar" /></span>
            <span className="grow"><strong>Επόμενη {nextBooking.slot.kind === "PAIR" ? "Therapair" : "ατομική"}</strong><div className="hint">{formatDate(nextBooking.slot.date)}, {formatTime(nextBooking.slot.startsAt)}{nextBooking.slot.therapist && ` · ${nextBooking.slot.therapist.name}`}</div></span>
            <Link className="btn primary" href={`/t/s/${nextBooking.slot.id}`}>Προβολή</Link>
          </div>
        ) : <Pill tone="grey">Δεν έχει προγραμματιστεί επόμενη ατομική</Pill>}
      </PageHead>
      <FolderTabs memberId={id} active="glance" />
      <div data-tour="safety" style={{ marginBottom: "var(--gap)" }}><SafetyZone memberId={id} variant="banner" flags={flags} /></div>
      {sp.case && <div className="notice">Η σύνοψη αποθηκεύτηκε ✓</div>}

      <div className="cols cols-60">
        <div className="stackv">
          <Panel title="Θεραπευτική συνέχεια" icon="doc" tour="clinical">
            <div className="linkrow" style={{ alignItems: "flex-start" }}>
              <span className="grow">
                <div className="row spread"><strong>Σύνοψη περίπτωσης</strong><Link className="small" href={`/t/members/${id}/case`}>{summary ? "Ενημέρωση / ιστορικό ›" : "Προσθήκη σύνοψης ›"}</Link></div>
                {summary ? (
                  <>
                    {CASE_FIELDS.filter((f) => summary.data[f.key]).slice(0, 1).map((f) => (
                      <div key={f.key} style={{ marginTop: 6 }}><div className="muted small">{f.label}</div><div className="body-text">{summary.data[f.key]}</div></div>
                    ))}
                    {CASE_FIELDS.filter((f) => summary.data[f.key]).length > 1 && (
                      <details className="fold small" style={{ marginTop: 6 }}>
                        <summary>Όλη η σύνοψη ({CASE_FIELDS.filter((f) => summary.data[f.key]).length} ενότητες)</summary>
                        {CASE_FIELDS.filter((f) => summary.data[f.key]).slice(1).map((f) => (
                          <div key={f.key} style={{ marginTop: 6 }}><div className="muted small">{f.label}</div><div className="body-text">{summary.data[f.key]}</div></div>
                        ))}
                      </details>
                    )}
                    <div className="hint" style={{ marginTop: 6 }}>{summary.author} · {formatWhen(summary.at)}</div>
                  </>
                ) : <div className="hint">Δεν έχει γραφτεί ακόμα. Τη γράφει θεραπευτής, όχι αυτόματα.</div>}
              </span>
            </div>
            <div className="linkrow" style={{ alignItems: "flex-start" }} data-tour="notes">
              <span className="grow">
                <strong>Τελευταίο διαθέσιμο σημείωμα</strong>
                {last ? <NoteSummary author={`${nameWithKind(last.therapist, last.therapistKind)}${last.pair ? " · Therapair" : ""}`} at={last.date} text={last.text} href={`/t/s/${last.slotId}`} label="Άνοιγμα σημειώματος" /> : <div className="hint">Δεν υπάρχει σημείωμα ακόμα.</div>}
              </span>
            </div>
            <div className="linkrow" style={{ alignItems: "flex-start" }}>
              <span className="grow">
                <strong>Ανοιχτά θέματα και συμφωνημένα επόμενα βήματα</strong>
                {last && (last.safety.safeOk === false || last.safety.concern || last.usedSince === "YES") && (
                  <div className="warn-text small wm" style={{ margin: "4px 0 6px" }}>
                    {last.safety.safeOk === false && <div><strong>Ανησυχία για την ασφάλεια (τελευταίο σημείωμα):</strong> {last.safety.safetyText || "βλ. προβληματισμό"}</div>}
                    {last.usedSince === "YES" && <div><strong>Χρήση από την προηγούμενη επαφή:</strong> ναι</div>}
                    {last.safety.concern && <div><strong>Προβληματισμός προς την ομάδα:</strong> {last.safety.concern}</div>}
                  </div>
                )}
                {h && (h.agreed || h.openIssues || h.handover || h.suggested) ? (
                  <div className="stack wm" style={{ marginTop: 4 }}>
                    {h.agreed && <div><span className="muted small">Συμφωνήθηκε ως επόμενο βήμα</span><div>{h.agreed}</div></div>}
                    {h.openIssues && <div><span className="muted small">Έμεινε ανοιχτό</span><div>{h.openIssues}</div></div>}
                    {h.handover && <div><span className="muted small">Για τον επόμενο θεραπευτή</span><div>{h.handover}</div></div>}
                    {h.suggested && <div><span className="muted small">Τι προτείναμε</span><div>{h.suggested}</div></div>}
                    <div className="hint">από το σημείωμα της {formatDate(last!.date)} · {nameWithKind(last!.therapist, last!.therapistKind)}</div>
                  </div>
                ) : <div className="hint">Δεν έχει καταγραφεί κάτι στο τελευταίο σημείωμα.</div>}
                {groupMentions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span className="muted small">Από τις ομάδες («Προσοχή σε…», 4 εβδομάδες)</span>
                    <ul className="small" style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                      {groupMentions.map((gm) => <li key={gm.id}>«{dec(gm.text)}» <span className="muted">· <Link href={`/t/group/${gm.groupSession.date}/${gm.groupSession.time.replace(":", "")}`}>{formatDate(gm.groupSession.date)}</Link>{gm.groupSession.coordinator && `, ${gm.groupSession.coordinator.name}`}</span></li>)}
                    </ul>
                  </div>
                )}
              </span>
            </div>
            <p className="hint" style={{ margin: "8px 0 0" }}><Link href={`/t/members/${id}/notes`}>Όλα τα σημειώματα ({noteCount}), με φίλτρα ›</Link></p>
          </Panel>

          <Panel title="Επόμενες ενέργειες" icon="check">
            {openActions.length === 0 && openIncidents === 0 && <EmptyState>Καμία εκκρεμής ενέργεια.</EmptyState>}
            {openActions.map((a) => <ActionRow key={a.key} a={a} viewer={viewer} staff={staff} back={`/t/members/${id}`} />)}
            {openIncidents > 0 && (
              <Link className="linkrow" href={`/t/members/${id}/incident`}>
                <span className="iconbox"><Icon name="list" /></span>
                <span className="grow"><div>{openIncidents} {openIncidents === 1 ? "ανοιχτό συμβάν" : "ανοιχτά συμβάντα"}</div><div className="hint">τα κλείνει η διαχείριση</div></span>
                <Pill tone="grey">ανοιχτό</Pill>
              </Link>
            )}
            {doneRecently.length > 0 && (
              <details className="fold small" style={{ marginTop: 10 }}>
                <summary className="muted">Ολοκληρώθηκαν πρόσφατα ({doneRecently.length})</summary>
                {doneRecently.map((d, i) => <div key={i} className="kv"><span>{d.title}</span><span>{d.by ?? "—"} · {formatDate(localParts(d.at).date)} {formatTime(d.at)}</span></div>)}
              </details>
            )}
          </Panel>

          <Panel icon="refresh" title={cycle ? `Τρέχων κύκλος · Μήνας ${months}` : "Τρέχων κύκλος"} link={{ href: `/t/members/${id}/cycle`, label: "Κλείσιμο κύκλου" }} tour="consistency">
            {!cycle ? <EmptyState>Δεν έχει ξεκινήσει κύκλος.</EmptyState> : cycle.done === 0 && cycle.groupsPassed === 0 ? (
              <EmptyState>Καμία προγραμματισμένη ατομική ή ομάδα δεν έχει περάσει ακόμη · {cycle.periodLabel}.</EmptyState>
            ) : (
              <>
                <p className="hint" style={{ margin: "0 0 8px" }}>{cycle.periodLabel}</p>
                <div className="kv"><span>Ατομικές που προβλέπει ο κύκλος</span><strong>{cycle.length}</strong></div>
                <div className="kv"><span>Έχουν προγραμματιστεί</span><strong>{cycle.booked}</strong></div>
                <div className="kv"><span>Ατομικές</span><strong>{describeCounts(cycle.presence)}</strong></div>
                {cycle.attended > 0 && <div className="kv"><span>Πηγή παρουσίας</span><strong className="small">{describeSources(cycle.presence)}</strong></div>}
                <div className="kv"><span>Ομάδες</span><strong>{describeGroups({ counted: cycle.groups, passed: cycle.groupsPassed, noRecord: cycle.groupsNoRecord })} <span className="muted small">· ο κύκλος προβλέπει {s.groupsPerCycle}</span></strong></div>
                <p className="hint" style={{ margin: "6px 0 0" }}>Παρουσία: πάτημα «Μπες» του μέλους («Από σύνδεση») ή επιβεβαίωση θεραπευτή· η επιβεβαίωση «Ήρθε / Δεν ήρθε» υπερισχύει. «Χωρίς καταγραφή» δεν σημαίνει απουσία.</p>
              </>
            )}
          </Panel>
        </div>

        <div className="stackv">
          <Panel title="Πρόσφατη πορεία" icon="list">
            <p className="hint" style={{ margin: "-6px 0 10px" }}>Τελευταίες {consistency.weeks} εβδομάδες · από {formatDate(consistency.from)}</p>
            <div className="stats tiles">
              <PresenceStat what="ομάδες" counted={consistency.groups} passed={consistency.groupsPassed} noRecord={consistency.groupsNoRecord} />
              <PresenceStat what="ατομικές" counted={consistency.sessionsDone} passed={consistency.sessionsTotal} noRecord={consistency.sessions.noRecord} />
            </div>
            <p className="hint" style={{ margin: "8px 0 0" }}>{PRESENCE_HINT}</p>
            {describeSources(consistency.sessions) && <p className="hint" style={{ margin: "4px 0 0" }}>Πηγή παρουσίας ατομικών: {describeSources(consistency.sessions)}{consistency.sessions.confirmedAbsent > 0 && ` · ${consistency.sessions.confirmedAbsent} «Δεν ήρθε» (επιβεβαίωση)`}</p>}
            <div className="row" style={{ gap: 4, marginTop: 8 }} aria-label="Παρουσίες στις ομάδες, μέρα με μέρα">
              {consistency.groupDays.map((d) => <span key={d.date} title={`${formatDate(d.date)}: ${d.present ? "καταγράφηκε παρουσία" : "χωρίς καταγραφή παρουσίας"}`} className={`dot${d.present ? " ok" : ""}`} />)}
            </div>
            <div className="kv" style={{ marginTop: 8 }}><span>Απογραφές</span><strong>{journal7} από 7 <span className="muted small">τελευταίες 7 ημέρες</span></strong></div>
            <p className="hint" style={{ margin: "6px 0 0" }}><Link href={`/t/members/${id}/journal`}>{seesJournalDetail(user) ? "Όλες οι απογραφές, μέρα-μέρα ›" : "Απογραφές (αριθμοί) ›"}</Link> · <Link href="/t/consistency">Συνέπεια όλων ›</Link></p>
          </Panel>

          <section className="panel sober" data-tour="sober">
            <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
              <span className="iconbox lg"><Icon name="leaf" size={28} /></span>
              <span>
                <strong style={{ fontSize: "1.25rem" }}>{member.soberSince ? `${sober ?? 0} μέρες νηφαλιότητας` : "Νηφαλιότητα: δεν έχει καταγραφεί ημερομηνία"}</strong>
                {member.soberSince && <div className="hint">Από {gr(member.soberSince)} · όπως καταγράφηκε στον φάκελο</div>}
              </span>
            </div>
            <div className="hint" style={{ marginTop: 10 }}>
              Ανάγκες ασφάλειας: <strong>{risk.label}</strong>{risk.level && risk.at && !risk.trigger && ` · ${RISK_INFO[risk.level].action} · ${formatDate(localParts(risk.at).date)}, ${risk.author}`}
              {" · "}<Link href={`/t/members/${id}/risk`}>Ανάγκες ›</Link> · <Link href={`/t/members/${id}/safety`}>Πλάνο {plan ? `(${formatDate(localParts(plan.updatedAt).date)})` : "(δεν έχει γραφτεί)"} ›</Link>
            </div>
            {ax?.data.summary && (
              <details className="fold" style={{ marginTop: 6 }}>
                <summary>Σύνοψη από την αρχική αξιολόγηση</summary>
                <div className="hint">{ax.author}{isPsychologist(user) && scores.length > 0 && ` · ${scores.join(" · ")} (περίοδος βαριάς χρήσης)`}</div>
                <div className="body-text wm">{ax.data.summary}</div>
              </details>
            )}
          </section>

          <Panel title="Στόχος και εργασία" icon="target" tour="goals">
            {lastGoal ? (
              <>
                <div className="hint">{lastGoal.week === mondayOf(today) ? "Στόχος αυτής της εβδομάδας" : "Τελευταίος καταγεγραμμένος στόχος"} · εβδομάδα {formatDate(lastGoal.week)}</div>
                <div style={{ fontWeight: 700, fontSize: "1.05rem", margin: "2px 0" }}>«{lastGoal.goal!.text}»</div>
                <div className="hint">Ναι {lastGoal.days.filter((d) => d.check === "YES").length} · Λίγο {lastGoal.days.filter((d) => d.check === "PARTLY").length} · Όχι {lastGoal.days.filter((d) => d.check === "NO").length}</div>
              </>
            ) : <EmptyState>Δεν έχει βάλει ακόμα στόχο εβδομάδας.</EmptyState>}
            <Link className="linkrow" href={`/t/members/${id}/assignments`} data-tour="step" style={{ marginTop: 10 }}>
              <span className="iconbox"><Icon name="doc" /></span>
              <span className="grow">
                {stepWork ? <><div>Βήμα {stepWork.step} · {stepWork.title}</div></> : <div className="hint">Δεν έχει σταλεί βήμα από τη διαχείριση.</div>}
              </span>
              {stepWork && <Pill tone="grey">{stepWork.status}</Pill>}
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          </Panel>

          <Panel title="Μήνες" tour="months">
            {seesMonthFolder(user) ? <MonthLinks memberId={id} /> : <p className="hint" style={{ margin: 0 }}>Ο φάκελος κάθε μήνα (με λήψη PDF) είναι στη διαχείριση. Το κλείσιμο κύκλου και το αρχείο: <Link href={`/t/members/${id}/cycle`}>Μήνες ›</Link> · <Link href={`/t/members/${id}/incident`}>Συμβάντα ›</Link></p>}
          </Panel>
        </div>
      </div>
      <TourFor id="member" userId={user.id} />
    </main>
  );
}

async function MonthLinks({ memberId }: { memberId: string }) {
  const months = await prisma.cycle.findMany({
    where: { memberId },
    orderBy: { startedAt: "asc" },
    select: { id: true, startedAt: true, closedAt: true, bookings: { select: { slot: { select: { date: true } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  if (months.length === 0) return <div className="empty">Δεν υπάρχει κύκλος ακόμα.</div>;
  return (
    <>
      {months.map((c, i) => (
        <Link key={c.id} className="linkrow" href={`/t/members/${memberId}/month/${c.id}`}>
          <span className="grow">Μήνας {i + 1} <span className="hint">· από {formatDate(cyclePeriod(c).from)}{c.closedAt ? "" : " · ανοιχτός"}</span></span>
          <span className="arrow"><Icon name="chevron" /></span>
        </Link>
      )).reverse()}
      <p className="hint" style={{ margin: "8px 0 0" }}><Link href={`/t/members/${memberId}/incident`}>Συμβάντα ›</Link></p>
    </>
  );
}
