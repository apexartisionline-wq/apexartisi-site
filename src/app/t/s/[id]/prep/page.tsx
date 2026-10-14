import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { GoalWeekCard } from "@/components/GoalWeek";
import { Icon } from "@/components/Icon";
import { JoinButton } from "@/components/JoinButton";
import { MemberGlance } from "@/components/MemberGlance";
import { NoteText } from "@/components/NoteText";
import { SafetyZone } from "@/components/SafetyZone";
import { SinceLast } from "@/components/SinceLast";
import { ThemeWeek } from "@/components/ThemeWeek";
import { TourFor } from "@/components/TourFor";
import { EmptyState, PageHead, Panel, Pill } from "@/components/ui";
import { isPsychologist, nameWithKind, seesJournalDetail } from "@/lib/access";
import { latestAssessment } from "@/lib/assessment-db";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionNumber } from "@/lib/member";
import { currentRisk, nextClinicalSession } from "@/lib/risk-db";
import { sessionGlance } from "@/lib/session-glance";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatSpan, formatTime, localParts } from "@/lib/time";

// «Προετοιμασία» (υπεύθυνη 14/10): πριν από την ατομική ο θεραπευτής δεν χρειάζεται ολόκληρη τη σελίδα της
// συνεδρίας με το σημειωματάριο — μόνο ό,τι πρέπει να ξέρει, σε μία στήλη για διάβασμα: ασφάλεια, το προηγούμενο
// σημείωμα ΟΛΟΚΛΗΡΟ (με υδατογράφημα), ό,τι έμεινε ανοιχτό, τι έγινε από τότε, στόχος, θεματική. Πάνω, σταθερά,
// χρονόμετρο και «Μπες». Μετά το τέλος της συνεδρίας η σελίδα παραπέμπει στη σελίδα της ατομικής (σημείωμα).
export default async function PrepPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const x = await prisma.slot.findUnique({
    where: { id },
    include: { therapist: { select: { name: true } }, bookings: { include: { member: { select: { id: true, name: true } } } } },
  });
  if (!x || x.bookings.length === 0) notFound();
  const now = new Date();
  const s = await getSettings();
  const pair = x.kind === "PAIR";
  const minutes = pair ? s.pairMinutes : s.sessionMinutes;
  const endsAt = new Date(x.startsAt.getTime() + minutes * 60_000);
  if (endsAt <= now) redirect(`/t/s/${x.id}`);
  const today = localParts(now).date;
  const room = s.rooms[x.position - 1] ?? "";
  const mine = user.role === "ADMIN" || x.therapistId === user.id;
  const canJoin = x.date === today && Boolean(room) && mine;
  const viewer = { id: user.id, role: user.role, therapistKind: (user as { therapistKind?: string | null }).therapistKind ?? null };
  const members = [...x.bookings].sort((p, q) => p.member.name.localeCompare(q.member.name, "el"));
  const [joined, number, perMember] = await Promise.all([
    prisma.staffJoin.findFirst({ where: { kind: "SLOT", ref: x.id, userId: user.id }, orderBy: { at: "asc" } }),
    !pair ? sessionNumber({ cycleId: members[0].cycleId, slot: x }) : Promise.resolve(null),
    Promise.all(members.map(async (b) => {
      const [g, intake, ax] = await Promise.all([sessionGlance(b.memberId, x), currentRisk(b.memberId), latestAssessment(b.memberId)]);
      const nextClinical = intake.trigger && !isPsychologist(viewer) ? await nextClinicalSession(b.memberId, now) : null;
      return { b, g, intake, ax, nextClinical };
    })),
  ]);
  for (const b of x.bookings) await logAccess(user.id, b.memberId, "session_prep_view");
  const what = pair ? "το Therapair σου" : "η ατομική σου";
  const initial = x.date === today ? `Ξεκινά στις ${formatTime(x.startsAt)}` : `Ξεκινά ${formatDate(x.date)} στις ${formatTime(x.startsAt)}`;
  const hm = (d: Date) => formatHour(localParts(d).hour, localParts(d).minute);
  const n = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));
  const theme = perMember[0].g.theme;

  return (
    <main className={pair ? "wide" : undefined}>
      <TourFor id="prep" userId={user.id} />
      <PageHead
        crumbs={[{ href: "/t", label: "Σήμερα" }, { label: pair ? "Therapair" : "Ατομική" }, { label: "Προετοιμασία" }]}
        title={<>{pair && <><Pill>Therapair</Pill> </>}{members.map((b, i) => <span key={b.memberId}>{i > 0 && " & "}<Link href={`/t/members/${b.memberId}`} style={{ color: "inherit", textDecoration: "none" }}>{b.member.name}</Link></span>)}</>}
        sub={<>Προετοιμασία · {formatDate(x.date)} {formatSpan(x.startsAt, minutes)}{number && ` · ${number}`}{x.therapist && ` · ${x.therapist.name}`}</>}
      >
        {!pair && <Link className="btn outline" href={`/t/members/${members[0].memberId}`}><Icon name="folder" size={18} /> Φάκελος</Link>}
        <Link className="btn outline" href={`/t/s/${x.id}`}>Σελίδα της {pair ? "συνεδρίας" : "ατομικής"} (σημειωματάριο)</Link>
      </PageHead>

      <div className="prep-bar" data-tour="prep-bar">
        <Countdown startsAt={x.startsAt.toISOString()} endsAt={endsAt.toISOString()} what={what} initial={initial} />
        <div className="prep-actions">
          {canJoin && (joined
            ? <a className="btn primary" href={room} target="_blank" rel="noopener noreferrer"><Icon name="video" size={18} /> Άνοιγμα Zoom</a>
            : <JoinButton kind="SLOT" refId={x.id} roomUrl={room} next={`/t/s/${x.id}`} label={pair ? "Μπες στο Therapair" : "Μπες στην ατομική"} icon="video" />)}
          {x.date === today && mine && (
            <span className="conn" title="Είναι η ώρα του πατήματος του κουμπιού «Μπες», όχι επιβεβαίωση συμμετοχής από το Zoom.">
              <i className={joined ? "on" : ""} />{joined ? `Συνδέθηκες στις ${hm(joined.at)}` : "Δεν έχεις πατήσει «Μπες»"}
              {!pair && members[0].joinedAt && <> · το μέλος πάτησε «Μπες» {hm(members[0].joinedAt)}</>}
            </span>
          )}
          {x.date === today && !mine && <span className="hint">Την ώρα την έχει {x.therapist?.name ?? "άλλος θεραπευτής"}.</span>}
        </div>
      </div>
      <p className="hint" style={{ margin: "-6px 0 14px" }}>
        Διάβασε με τη σειρά: ασφάλεια → τι έμεινε ανοιχτό → το προηγούμενο σημείωμα ολόκληρο → τι έγινε από τότε. Το «Μπες» μένει πάνω όσο διαβάζεις· το σημειωματάριο είναι στη σελίδα της {pair ? "συνεδρίας" : "ατομικής"}.
      </p>

      <div className={pair ? "pair-grid" : undefined} data-tour={pair ? "pair-members" : undefined}>
      {perMember.map(({ b, g, intake, ax, nextClinical }) => {
        const h = g.prev?.handover;
        const hasHandover = Boolean(h && (h.agreed || h.openIssues || h.handover));
        const prevSafety = Boolean(g.prev && (g.prev.safety.safeOk === false || g.prev.safety.concern || g.prev.usedSince === "YES"));
        return (
          <section key={b.memberId} className={pair ? "stackv pair-col" : "stackv"} style={{ marginBottom: 24 }}>
            {pair && <h2 style={{ margin: "8px 0 0" }}><Link href={`/t/members/${b.memberId}`} style={{ color: "inherit", textDecoration: "none" }}>{b.member.name}</Link> <Link className="small" href={`/t/members/${b.memberId}`}>φάκελος ›</Link></h2>}
            <div data-tour="safety"><SafetyZone memberId={b.memberId} viewer={viewer} back={`/t/s/${x.id}/prep`} /></div>

            <Panel title="Με μια ματιά" tour="glance">
              <MemberGlance g={g} intake={intake} groupsPerCycle={s.groupsPerCycle} viewer={viewer} nextClinical={nextClinical} compact={pair} />
            </Panel>

            <Panel title="Ανοιχτό από την προηγούμενη φορά" tour="open">
              {g.prev ? (
                <>
                  <p className="hint" style={{ margin: "-6px 0 10px" }}>{nameWithKind(g.prev.by, g.prev.byKind)}{g.prev.pair ? " · Therapair" : ""} · {formatDate(g.prev.date)}</p>
                  {prevSafety && (
                    <div className="attn yellow wm" style={{ marginBottom: 10 }} data-tour="prev-safety">
                      <span className="iconbox yellow"><Icon name="alert" size={18} /></span>
                      <div className="attn-body small">
                        {g.prev.safety.safeOk === false && <div><strong>Ανησυχία για την ασφάλεια στο προηγούμενο σημείωμα:</strong> {g.prev.safety.safetyText || "βλ. προβληματισμό"}</div>}
                        {g.prev.usedSince === "YES" && <div><strong>Χρήση από την προηγούμενη επαφή:</strong> ναι (κατά το προηγούμενο σημείωμα)</div>}
                        {g.prev.safety.concern && <div><strong>Προβληματισμός προς την ομάδα:</strong> {g.prev.safety.concern}</div>}
                      </div>
                    </div>
                  )}
                  {hasHandover ? (
                    <div className="stack wm">
                      {h!.agreed && <div><span className="muted small">Συμφωνήθηκε ως επόμενο βήμα</span><div>{h!.agreed}</div></div>}
                      {h!.openIssues && <div><span className="muted small">Έμεινε ανοιχτό</span><div>{h!.openIssues}</div></div>}
                      {h!.handover && <div><span className="muted small">Για τον επόμενο θεραπευτή</span><div>{h!.handover}</div></div>}
                      {h!.suggested && <div><span className="muted small">Τι προτείναμε</span><div>{h!.suggested}</div></div>}
                    </div>
                  ) : (
                    <div className="wm">{g.prev.next ? <><span className="muted small">Τι προτείναμε</span><div>{g.prev.next}</div></> : <span className="muted">Δεν άφησε κάτι για την επόμενη ατομική.</span>}</div>
                  )}
                </>
              ) : <EmptyState>Πρώτη ατομική: δεν υπάρχει προηγούμενο σημείωμα.</EmptyState>}
            </Panel>

            {g.prev && (
              <Panel title="Το προηγούμενο σημείωμα, ολόκληρο" id={pair ? `note-${b.memberId}` : "note"} tour="note" link={{ href: `/t/s/${g.prev.slotId}`, label: "Η ατομική εκείνη" }}>
                <p className="hint" style={{ margin: "-6px 0 10px" }}>{nameWithKind(g.prev.by, g.prev.byKind)}{g.prev.pair ? " · Therapair" : ""} · {formatDate(g.prev.date)} · <Link href={`/t/members/${b.memberId}/notes`}>όλα τα σημειώματα</Link></p>
                <div className="wm prep-note"><NoteText text={g.prev.text} /></div>
              </Panel>
            )}

            {g.prev && (
              <Panel title="Από την προηγούμενη ατομική ως σήμερα" tour="since">
                <SinceLast journalDetail={seesJournalDetail(viewer)} memberId={b.memberId} prev={g.prev} until={today} untilAt={now} compact />
              </Panel>
            )}

            <Panel title="Στόχος και εργασία" tour="goal">
              <GoalWeekCard detail={seesJournalDetail(viewer)} memberId={b.memberId} date={today} />
              {g.assignment ? (
                <Link className="linkrow" href={`/t/members/${b.memberId}/assignments`}>
                  <span className="iconbox"><Icon name="doc" /></span>
                  <span className="grow"><div>{g.assignment.title}</div><div className="hint">{g.assignment.answered ? "Έχει απαντήσει" : g.assignment.length ? "Σε εξέλιξη" : "Δεν ξεκίνησε"}</div></span>
                  <span className="arrow"><Icon name="chevron" /></span>
                </Link>
              ) : <p className="hint" style={{ margin: "8px 0 0" }}>Δεν έχει σταλεί εργασία.</p>}
            </Panel>

            {ax?.data.summary && (
              <details className="panel fold">
                <summary>Σύνοψη από την αρχική αξιολόγηση <span className="muted small">· {ax.author}</span></summary>
                <div className="body-text wm" style={{ marginTop: 8 }}>{ax.data.summary}</div>
                {isPsychologist(viewer) && <Link className="small" href={`/t/members/${b.memberId}/assessment`}>Όλη η αξιολόγηση ›</Link>}
              </details>
            )}
          </section>
        );
      })}
      </div>

      <Panel>
        <ThemeWeek forms={theme.forms} dailyText={theme.dailyText} compact />
      </Panel>

      <div className="row" style={{ marginTop: 16, gap: 10, flexWrap: "wrap" }}>
        {canJoin && !joined && <JoinButton kind="SLOT" refId={x.id} roomUrl={room} next={`/t/s/${x.id}`} label={pair ? "Μπες στο Therapair" : "Μπες στην ατομική"} icon="video" />}
        <Link className="btn outline" href={`/t/s/${x.id}`}>Σελίδα της {pair ? "συνεδρίας" : "ατομικής"} ›</Link>
        <Link className="btn outline" href="/t">Πίσω στο «Σήμερα»</Link>
      </div>
    </main>
  );
}
