import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { FolderTabs } from "@/components/FolderTabs";
import { Icon } from "@/components/Icon";
import { NoteText } from "@/components/NoteText";
import { notFound } from "next/navigation";
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
import { caseHistory, memberConsistency } from "@/lib/handover";
import { CASE_FIELDS } from "@/lib/handover-rules";
import { memberIntake } from "@/lib/intake";
import { RISK_INFO } from "@/lib/intake-rules";
import { currentRisk } from "@/lib/risk-db";
import { lastFinishedCycle } from "@/lib/cycle-review";
import { cycleInfo, cyclePeriod } from "@/lib/member";
import { memberNotes } from "@/lib/member-notes";
import { getSettings } from "@/lib/settings";
import { programDay } from "@/lib/program";
import { addDays, formatDate, formatHour, formatWhen, localParts, mondayOf } from "@/lib/time";

const CARE_LABEL: Record<string, string> = { caring_24h: "Μήνυμα φροντίδας (24 ώρες μετά από κρίση)", caring_7d: "Μήνυμα φροντίδας (7 μέρες μετά από κρίση)", dropout: "Επικοινωνία: χωρίς επαφή εδώ και μέρες", risk_contact: "Επικοινωνία μετά από ανάγκες ασφάλειας" };
// Ποιος εκτελεί κάθε ενέργεια, κατά τους κανόνες του προγράμματος (όχι «θεραπευτής αναφοράς»).
const CARE_WHO: Record<string, string> = { caring_24h: "όποιος θεραπευτής το κάνει, το σημειώνει", caring_7d: "όποιος θεραπευτής το κάνει, το σημειώνει", dropout: "η διαχείριση (τηλέφωνο)", risk_contact: "η διαχείριση (τηλέφωνο)" };

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

  // Επόμενες ενέργειες: τι χρειάζεται, ποιος το κάνει (κατά τους κανόνες), από πότε, κατάσταση.
  const actions: { icon: string; title: string; who: string; since?: Date; status: string; href: string; tone: "red" | "yellow" | "grey" }[] = [];
  if (helpOpen) actions.push({ icon: "alert", title: "Κόκκινο κουμπί: να μιλήσει κάποιος μαζί του", who: helpOpen.claimedByName ? `το ανέλαβε: ${helpOpen.claimedByName}` : "δεν το έχει αναλάβει κανείς", since: helpOpen.createdAt, status: helpOpen.claimedAt ? "σε εξέλιξη" : "ανοιχτό", href: `/t/help/${helpOpen.id}`, tone: "red" });
  if (risk.trigger) actions.push({ icon: "shield", title: "Αξιολόγηση αναγκών ασφάλειας", who: "ψυχολόγος, στην επόμενη ατομική", since: risk.trigger.at, status: `εκκρεμεί · μετά από ${risk.trigger.text}`, href: `/t/members/${id}/risk`, tone: "red" });
  for (const c of careOpen) actions.push({ icon: c.kind.startsWith("caring") ? "chat" : "phone", title: CARE_LABEL[c.kind] ?? c.kind, who: CARE_WHO[c.kind] ?? "η ομάδα", since: c.dueAt, status: c.dueAt <= now ? "ανοιχτό" : `από ${formatDate(localParts(c.dueAt).date)}`, href: `/t/members/${id}`, tone: "yellow" });
  if (!assessment) actions.push({ icon: "doc", title: "Αρχική αξιολόγηση", who: "ψυχολόγος, στην 1η ατομική (~40′)", status: ax ? `σε εξέλιξη · ${ax.author}` : "δεν έχει γίνει", href: `/t/members/${id}/assessment`, tone: "yellow" });
  if (finished && !reviewDone) actions.push({ icon: "refresh", title: "Ανασκόπηση κύκλου (2 γραμμές)", who: "όποιος είχε την τελευταία ατομική", status: "εκκρεμεί", href: `/t/members/${id}/cycle`, tone: "yellow" });
  if (openIncidents > 0) actions.push({ icon: "list", title: `${openIncidents} ${openIncidents === 1 ? "ανοιχτό συμβάν" : "ανοιχτά συμβάντα"}`, who: "τα κλείνει η διαχείριση", status: "ανοιχτό", href: `/t/members/${id}/incident`, tone: "grey" });

  return (
    <main className="wide">
      <p className="crumbs"><Link href="/t/members">Μέλη</Link> <span>/</span> <span>Καρτέλα μέλους</span></p>
      <div className="page-head">
        <div>
          <h1>{member.name}</h1>
          <p className="page-sub">
            {day ? `${day}η μέρα στο πρόγραμμα` : "Η έναρξη δεν έχει ημερομηνία ακόμα"} · {cycle ? `Μήνας ${months}` : "χωρίς κύκλο ακόμα"}
            {step && <> · Βήμα {step.step} <span className="small">(το είπε το μέλος, {formatDate(localParts(step.createdAt).date)})</span></>}
          </p>
        </div>
        <div className="head-actions">
          {nextBooking ? (
            <div className="card" style={{ margin: 0, padding: "8px 12px", display: "flex", gap: 12, alignItems: "center" }}>
              <span className="iconbox"><Icon name="calendar" /></span>
              <span><strong>Επόμενη {nextBooking.slot.kind === "PAIR" ? "Therapair" : "ατομική"}</strong><div className="hint">{formatDate(nextBooking.slot.date)}, {formatHour(nextBooking.slot.hour)}{nextBooking.slot.therapist && ` · ${nextBooking.slot.therapist.name}`}</div></span>
              <Link className="btn primary" href={`/t/s/${nextBooking.slot.id}`}>Προβολή</Link>
            </div>
          ) : <span className="pill grey">Δεν έχει προγραμματιστεί επόμενη ατομική</span>}
        </div>
      </div>
      <FolderTabs memberId={id} active="glance" />
      <div data-tour="safety"><SafetyZone memberId={id} /></div>
      {sp.case && <div className="notice">Η σύνοψη αποθηκεύτηκε ✓</div>}

      <div className="cols cols-60">
        <div className="stackv">
          <section className="panel" data-tour="clinical">
            <h2>Θεραπευτική συνέχεια</h2>
            <div className="linkrow" style={{ alignItems: "flex-start" }}>
              <span className="iconbox"><Icon name="doc" /></span>
              <span className="grow">
                <div className="row spread"><strong>Σύνοψη περίπτωσης</strong><Link className="small" href={`/t/members/${id}/case`}>{summary ? "Ενημέρωση / ιστορικό ›" : "Γράψε τη σύνοψη ›"}</Link></div>
                {summary ? (
                  <>
                    {CASE_FIELDS.filter((f) => summary.data[f.key]).map((f) => (
                      <div key={f.key} style={{ marginTop: 6 }}><div className="muted small">{f.label}</div><div className="body-text">{summary.data[f.key]}</div></div>
                    ))}
                    <div className="hint" style={{ marginTop: 6 }}>{summary.author} · {formatWhen(summary.at)}</div>
                  </>
                ) : <div className="hint">Δεν έχει γραφτεί ακόμα. Τη γράφει θεραπευτής, όχι αυτόματα.</div>}
              </span>
            </div>
            <div className="linkrow" style={{ alignItems: "flex-start" }} data-tour="notes">
              <span className="iconbox"><Icon name="doc" /></span>
              <span className="grow">
                <div className="row spread"><strong>Τελευταίο γραπτό σημείωμα</strong>{last && <Link className="small" href={`/t/s/${last.slotId}`}>Άνοιγμα ›</Link>}</div>
                {last ? (
                  <>
                    <div className="hint">{formatDate(last.date)} {formatHour(last.hour)} · {last.therapist}{last.pair && " · Therapair"} · παραμένει εδώ ακόμη κι αν μεσολάβησαν απουσίες</div>
                    <details className="fold" style={{ marginTop: 4 }}>
                      <summary>Το κείμενο</summary>
                      <NoteText text={last.text} style={{ marginTop: 6 }} />
                    </details>
                  </>
                ) : <div className="hint">Δεν υπάρχει σημείωμα ακόμα.</div>}
              </span>
            </div>
            <div className="linkrow" style={{ alignItems: "flex-start" }}>
              <span className="iconbox"><Icon name="target" /></span>
              <span className="grow">
                <strong>Ανοιχτά θέματα και συμφωνημένα επόμενα βήματα</strong>
                {h && (h.agreed || h.openIssues || h.handover || h.suggested) ? (
                  <div className="stack" style={{ marginTop: 4 }}>
                    {h.agreed && <div><span className="muted small">Συμφωνήθηκε ως επόμενο βήμα</span><div>{h.agreed}</div></div>}
                    {h.openIssues && <div><span className="muted small">Έμεινε ανοιχτό</span><div>{h.openIssues}</div></div>}
                    {h.handover && <div><span className="muted small">Για τον επόμενο θεραπευτή</span><div>{h.handover}</div></div>}
                    {h.suggested && <div><span className="muted small">Τι προτείναμε</span><div>{h.suggested}</div></div>}
                    <div className="hint">από το σημείωμα της {formatDate(last!.date)} · {last!.therapist}</div>
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
          </section>

          <section className="panel">
            <h2>Επόμενες ενέργειες</h2>
            {actions.length === 0 && <div className="empty">Καμία εκκρεμής ενέργεια.</div>}
            {actions.map((a, i) => (
              <Link key={i} className="linkrow" href={a.href}>
                <span className={`iconbox ${a.tone === "grey" ? "" : a.tone}`}><Icon name={a.icon} /></span>
                <span className="grow">
                  <div>{a.title}</div>
                  <div className="hint">Ποιος: {a.who}{a.since && ` · από ${formatDate(localParts(a.since).date)}`}</div>
                </span>
                <span className={`pill ${a.tone}`}>{a.status}</span>
              </Link>
            ))}
          </section>

          <section className="panel" data-tour="consistency">
            <div className="panel-head"><h2>Τρέχων κύκλος{cycle && ` · Μήνας ${months}`}</h2><Link className="small" href={`/t/members/${id}/cycle`}>Ανασκόπηση κύκλου ›</Link></div>
            {!cycle ? <div className="empty">Δεν έχει ξεκινήσει κύκλος.</div> : cycle.done === 0 ? (
              <div className="empty">Νέος κύκλος: δεν έχει γίνει ατομική ακόμα{period && ` · από ${formatDate(period.from)}`}.</div>
            ) : (
              <>
                <div className="kv"><span>Ατομικές που έγιναν</span><strong>{cycle.done} από {cycle.length}</strong></div>
                <div className="kv"><span>Ήρθε σε</span><strong>{cycle.attended} από {cycle.done} <span className="muted small">(πάτησε «Μπες» ή σημείωμα «Ήρθε»)</span></strong></div>
                <div className="kv"><span>Ομάδες στον κύκλο</span><strong>{cycle.groups} από {s.groupsPerCycle}</strong></div>
                {period && <div className="hint" style={{ marginTop: 6 }}>Περίοδος κύκλου: {formatDate(period.from)} – {formatDate(period.to)}</div>}
              </>
            )}
          </section>
        </div>

        <div className="stackv">
          <section className="panel">
            <div className="panel-head"><h2>Πρόσφατη πορεία</h2><span className="hint">τελευταίες {consistency.weeks} εβδομάδες</span></div>
            <div className="stats">
              <div className="stat"><b>{consistency.groups}/{consistency.groupDays.length}</b><span>ομάδες · ήρθε / έγιναν</span></div>
              <div className="stat"><b>{consistency.sessionsDone}/{consistency.sessionsTotal}</b><span>ατομικές · ήρθε / έγιναν</span></div>
            </div>
            <div className="row" style={{ gap: 4, marginTop: 8 }} aria-label="Παρουσίες στις ομάδες, μέρα με μέρα">
              {consistency.groupDays.map((d) => <span key={d.date} title={`${formatDate(d.date)}: ${d.present ? "ήρθε" : "δεν ήρθε"}`} className={`dot${d.present ? " ok" : ""}`} />)}
            </div>
            <div className="kv" style={{ marginTop: 8 }}><span>Απογραφές</span><strong>{journal7} από 7 <span className="muted small">τελευταίες 7 ημέρες</span></strong></div>
            <p className="hint" style={{ margin: "6px 0 0" }}><Link href={`/t/members/${id}/journal`}>Όλες οι απογραφές, μέρα-μέρα ›</Link> · <Link href="/t/consistency">Συνέπεια όλων ›</Link></p>
          </section>

          <section className="panel" data-tour="sober" style={{ background: "var(--soft)" }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="iconbox"><Icon name="leaf" /></span>
              <span>
                <strong style={{ fontSize: "1.15rem" }}>{member.soberSince ? `${sober ?? 0} μέρες νηφαλιότητας` : "Νηφαλιότητα: δεν έχει καταγραφεί ημερομηνία"}</strong>
                {member.soberSince && <div className="hint">Από {gr(member.soberSince)} · όπως καταγράφηκε στον φάκελο</div>}
              </span>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              Ανάγκες ασφάλειας: <strong>{risk.label}</strong>{risk.level && risk.at && !risk.trigger && ` · ${RISK_INFO[risk.level].action} · ${formatDate(localParts(risk.at).date)}, ${risk.author}`}
              {" · "}<Link href={`/t/members/${id}/risk`}>Ανάγκες ›</Link> · <Link href={`/t/members/${id}/safety`}>Πλάνο {plan ? `(${formatDate(localParts(plan.updatedAt).date)})` : "(δεν έχει γραφτεί)"} ›</Link>
            </div>
            {ax?.data.summary && (
              <details className="fold" style={{ marginTop: 6 }}>
                <summary>Σύνοψη από την αρχική αξιολόγηση</summary>
                <div className="hint">{ax.author}{scores.length > 0 && ` · ${scores.join(" · ")} (περίοδος βαριάς χρήσης)`}</div>
                <div className="body-text">{ax.data.summary}</div>
              </details>
            )}
          </section>

          <section className="panel" data-tour="goals">
            <h2>Στόχος και εργασία</h2>
            {lastGoal ? (
              <>
                <div className="hint">{lastGoal.week === mondayOf(today) ? "Στόχος αυτής της εβδομάδας" : "Τελευταίος καταγεγραμμένος στόχος"} · εβδομάδα {formatDate(lastGoal.week)}</div>
                <div style={{ fontWeight: 600 }}>«{lastGoal.goal!.text}»</div>
                <div className="hint">Ναι {lastGoal.days.filter((d) => d.check === "YES").length} · Λίγο {lastGoal.days.filter((d) => d.check === "PARTLY").length} · Όχι {lastGoal.days.filter((d) => d.check === "NO").length}</div>
              </>
            ) : <div className="empty">Δεν έχει βάλει ακόμα στόχο εβδομάδας.</div>}
            <Link className="linkrow" href={`/t/members/${id}/assignments`} data-tour="step" style={{ marginTop: 8 }}>
              <span className="iconbox"><Icon name="doc" /></span>
              <span className="grow">
                {stepWork ? <><div>Βήμα {stepWork.step} · {stepWork.title}</div><div className="hint">{stepWork.status}</div></> : <div className="hint">Δεν έχει σταλεί βήμα από τη διαχείριση.</div>}
              </span>
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          </section>

          <section className="panel" data-tour="months">
            <h2>Μήνες</h2>
            <MonthLinks memberId={id} />
          </section>
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
