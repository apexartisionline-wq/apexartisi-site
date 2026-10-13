import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { DayPicker } from "@/components/DayPicker";
import { StaffMessagesLine } from "@/components/StaffMessagesLine";
import { JoinButton } from "@/components/JoinButton";
import { Icon } from "@/components/Icon";
import { ActionRow, type StaffOption } from "@/components/ActionRow";
import { alertHref } from "@/components/AlertBoxes";
import { AttentionCard, type Issue } from "@/components/AttentionCard";
import { NoteSummary } from "@/components/NoteSummary";
import { EmptyState, PageHead, Panel, Pill, type Tone } from "@/components/ui";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { alertBoxes } from "@/lib/assessment-db";
import { buildActions, type ActionView } from "@/lib/actions-core";
import { fetchCare, fetchItemRows, fetchOpenHelp } from "@/lib/actions";
import { dueCycleReviews } from "@/lib/cycle-review";
import { groupDays } from "@/lib/groups";
import { memberSafety } from "@/lib/handover";
import { memberNotes } from "@/lib/member-notes";
import { sessionPresence } from "@/lib/presence";
import { getSettings } from "@/lib/settings";
import { ensureDemoToday, isDemoSite, startDemoSession } from "@/lib/demo-session";
import { addDays, athensToUtc, formatDate, formatTime, localParts, toMinutes } from "@/lib/time";

// Μόνο στη δοκιμαστική εγκατάσταση: φτιάχνει μια ατομική «τώρα» με ψεύτικο μέλος, για να δοκιμάσει κανείς τη σύνδεση.
async function demoStart() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  await startDemoSession(user);
  redirect("/t");
}

const KIND_LABEL: Record<string, string> = { CLINICAL: "ψυχολόγος", BIOMATIC: "βιωματικός θεραπευτής", BOTH: "ψυχολόγος και βιωματικός" };

type Item = {
  key: string;
  startsAt: Date;
  endsAt: Date;
  kind: "Ατομική" | "Therapair" | "Ομάδα";
  icon: "user" | "group";
  title: string;
  sub?: string;
  href: string;
  memberHref?: string; // φάκελος (μόνο στην ατομική)
  memberId?: string;
  hasNote: boolean;
  memberJoinedAt: Date | null; // πάτησε «Μπες» το μέλος (μόνο ατομική)
  memberConfirmed: boolean | null; // επιβεβαίωση θεραπευτή «Ήρθε/Δεν ήρθε» (μόνο ατομική)
  join: { kind: "SLOT" | "GROUP"; ref: string; room: string; label: string };
  opensForMembersAt: Date;
};

// «Σήμερα»: το κεντρικό σημείο της μέρας του θεραπευτή (ανασχεδιασμός 13/10, 2ο πέρασμα — εγκεκριμένη εικόνα «Σήμερα»).
// Αριστερά (~60%) το πρόγραμμα με την επόμενη συνεδρία ως πρώτο σημείο αναφοράς, δεξιά (~40%) «Χρειάζεται προσοχή» και «Εκκρεμότητες».
export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const now = new Date();
  const today = localParts(now).date;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const s = await getSettings();
  if (date === today) await ensureDemoToday();

  const [boxes, slots, week, groups, members, staffRows, holiday] = await Promise.all([
    alertBoxes(user.role),
    prisma.slot.findMany({
      where: { date, therapistId: user.id, bookings: { some: {} } },
      include: { bookings: { include: { member: { select: { id: true, name: true } } } }, note: { select: { id: true } }, pairNotes: { select: { id: true } } },
      orderBy: [{ hour: "asc" }, { position: "asc" }],
    }),
    prisma.slot.findMany({
      where: { therapistId: user.id, date: { gt: date, lte: addDays(date, 7) }, bookings: { some: {} } },
      include: { bookings: { include: { member: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { hour: "asc" }],
    }),
    groupDays(date, addDays(date, 7), s),
    prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true } }),
    user.role === "ADMIN" ? prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true, name: true, therapistKind: true, role: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.holiday.findUnique({ where: { date } }),
  ]);
  const staff: StaffOption[] = staffRows.map((u) => ({ id: u.id, name: u.name, clinician: u.role === "ADMIN" || u.therapistKind === "CLINICAL" || u.therapistKind === "BOTH", admin: u.role === "ADMIN" }));
  const viewer = { id: user.id, role: user.role, therapistKind: user.therapistKind };
  const myGroups = groups.filter((g) => g.coordinatorId === user.id);
  const names = (x: { bookings: { member: { name: string } }[] }) => x.bookings.map((b) => b.member.name).join(" & ");
  // Μικρό όνομα και αρχικό, για να χωράει στο κινητό (π.χ. «Γιώργος Δ. & Ελένη Δ.»).
  const short = (x: { bookings: { member: { name: string } }[] }) =>
    x.bookings.map((b) => b.member.name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")).join(" & ");
  const isToday = date === today;
  const joinBefore = (d: Date, min: number) => new Date(d.getTime() - min * 60_000);

  const items: Item[] = [
    ...myGroups.filter((g) => g.date === date).map((g) => {
      const startsAt = athensToUtc(g.date, Math.floor(toMinutes(g.time) / 60), toMinutes(g.time) % 60);
      return {
        key: `g${g.time}`, startsAt, endsAt: new Date(startsAt.getTime() + s.groupDurationMinutes * 60_000),
        kind: "Ομάδα" as const, icon: "group" as const, title: "Εσύ συντονίζεις",
        href: `/t/group/${g.date}/${g.time.replace(":", "")}`, hasNote: g.hasNote, memberJoinedAt: null, memberConfirmed: null,
        join: { kind: "GROUP" as const, ref: `${g.date} ${g.time}`, room: s.groupRoomUrl, label: "Μπες στην ομάδα" },
        opensForMembersAt: joinBefore(startsAt, s.groupJoinBeforeMinutes),
      };
    }),
    ...slots.map((x) => {
      const pair = x.kind === "PAIR";
      return {
        key: x.id, startsAt: x.startsAt, endsAt: new Date(x.startsAt.getTime() + (pair ? s.pairMinutes : s.sessionMinutes) * 60_000),
        kind: (pair ? "Therapair" : "Ατομική") as "Ατομική" | "Therapair", icon: (pair ? "group" : "user") as "user" | "group", title: short(x),
        href: `/t/s/${x.id}`, memberHref: !pair && x.bookings[0] ? `/t/members/${x.bookings[0].member.id}` : undefined, memberId: !pair ? x.bookings[0]?.member.id : undefined,
        hasNote: pair ? x.pairNotes.length > 0 : Boolean(x.note), memberJoinedAt: !pair ? (x.bookings[0]?.joinedAt ?? null) : null, memberConfirmed: !pair ? (x.bookings[0]?.confirmedCame ?? null) : null,
        join: { kind: "SLOT" as const, ref: x.id, room: s.rooms[x.position - 1] ?? "", label: pair ? "Μπες στο Therapair" : "Μπες στην ατομική" },
        opensForMembersAt: joinBefore(x.startsAt, s.sessionJoinBeforeMinutes),
      };
    }),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Η επόμενη συνεδρία: η πρώτη που δεν έχει τελειώσει ακόμα (μόνο για σήμερα).
  const nextKey = isToday ? items.find((it) => it.endsAt > now)?.key : undefined;

  // Κατάσταση κάθε ραντεβού, με λέξεις (όχι μόνο χρώμα). Μια συνεδρία δεν θεωρείται «έγινε» μόνο επειδή πέρασε η ώρα της.
  const statusOf = (it: Item): { text: string; tone: Tone } => {
    const mins = Math.round((it.startsAt.getTime() - now.getTime()) / 60_000);
    if (it.kind !== "Ατομική") {
      if (now < it.startsAt) return isToday && mins <= 60 ? { text: `Σε ${mins} λεπτά`, tone: "solid" } : { text: it.startsAt > now && !isToday ? "Προγραμματισμένη" : `Στις ${formatTime(it.startsAt)}`, tone: "grey" };
      if (now <= it.endsAt) return { text: "Σε εξέλιξη τώρα", tone: "solid" };
      return it.hasNote ? { text: "Σημείωμα ✓", tone: "ok" } : { text: "Η προγραμματισμένη ώρα πέρασε — εκκρεμεί καταγραφή", tone: "yellow" };
    }
    const p = sessionPresence({ startsAt: it.startsAt, endsAt: it.endsAt, now, joinedAt: it.memberJoinedAt, confirmedCame: it.memberConfirmed });
    switch (p) {
      case "future": return isToday && mins <= 60 ? { text: `Σε ${mins} λεπτά`, tone: "solid" } : { text: isToday ? `Στις ${formatTime(it.startsAt)}` : "Προγραμματισμένη", tone: "grey" };
      case "in_progress": return { text: "Σε εξέλιξη τώρα", tone: "solid" };
      case "present_confirmed": return { text: "Σημείωμα ✓ · παρουσία", tone: "ok" };
      case "absent_confirmed": return { text: "Σημείωμα: δεν ήρθε", tone: "yellow" };
      case "present_join":
        if (now < it.startsAt) return { text: `Σε ${mins} λεπτά · το μέλος μπήκε`, tone: "solid" };
        if (now <= it.endsAt) return { text: "Σε εξέλιξη τώρα · παρουσία από σύνδεση", tone: "solid" };
        return it.hasNote ? { text: "Σημείωμα ✓ · παρουσία", tone: "ok" } : { text: "Παρουσία από σύνδεση · εκκρεμεί σημείωμα", tone: "yellow" };
      default: return { text: "Η προγραμματισμένη ώρα πέρασε — εκκρεμεί καταγραφή", tone: "yellow" };
    }
  };

  // ── Χρειάζεται προσοχή / ενέργειες ──────────────────────────────────────────────────────────────
  const inBox = new Set(boxes.flatMap((b) => b.items.flatMap((a) =>
    a.source === "ASSESSMENT" ? [`${b.id}:assessment_${a.kind}`] : a.source === "JOURNAL" ? [`${b.id}:journal_${a.kind.split(":")[1]}`] : [],
  )));
  const memberIds = members.map((m) => m.id);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  // Αρχική αξιολόγηση που δεν έγινε: ενέργεια ψυχολόγου, για μέλη με ατομική τις επόμενες 7 μέρες (εκεί θα γίνει).
  const [assessedRows, upcomingRows] = await Promise.all([
    prisma.assessment.findMany({ where: { memberId: { in: memberIds }, complete: true }, select: { memberId: true }, distinct: ["memberId"] }),
    prisma.booking.findMany({ where: { memberId: { in: memberIds }, slot: { startsAt: { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } }, select: { memberId: true }, distinct: ["memberId"] }),
  ]);
  const assessed = new Set(assessedRows.map((r) => r.memberId));
  const upcoming = new Set(upcomingRows.map((r) => r.memberId));
  const [flagsAll, reviews, itemRows, careRows, helpRows] = await Promise.all([
    Promise.all(memberIds.map(async (id) => [id, await memberSafety(id)] as const)),
    dueCycleReviews(memberIds),
    fetchItemRows(memberIds, now),
    // Και τα τηλεφωνήματα της διαχείρισης: οι θεραπευτές βλέπουν την κατάσταση (χωρίς τηλέφωνο), δεν τα αναλαμβάνουν.
    fetchCare(memberIds, { includeAdminKinds: true }),
    fetchOpenHelp(memberIds),
  ]);
  const flags = new Map(flagsAll);
  const cycleSince = new Map<string, Date>();
  if (reviews.length > 0) {
    const bs = await prisma.booking.findMany({ where: { cycleId: { in: reviews.map((r) => r.cycleId) } }, select: { cycleId: true, slot: { select: { startsAt: true } } } });
    for (const b of bs) if (b.cycleId && (cycleSince.get(b.cycleId)?.getTime() ?? 0) < b.slot.startsAt.getTime()) cycleSince.set(b.cycleId, b.slot.startsAt);
  }
  const actionsBy = new Map<string, ActionView[]>();
  for (const id of memberIds) {
    const f = flags.get(id) ?? [];
    const rr = f.find((x) => x.key === "risk_review");
    const rev = reviews.find((r) => r.memberId === id);
    const list = buildActions({
      memberId: id, memberName: memberName.get(id) ?? "Μέλος",
      riskTrigger: rr?.at ? { at: rr.at, text: (rr as { trigText?: string }).trigText ?? "νέα αφορμή" } : null,
      initialAssessmentMissing: !assessed.has(id) && upcoming.has(id) ? { detail: "δεν έχει γίνει ακόμα · στην επόμενη ατομική με ψυχολόγο", since: null } : null,
      cycleReviewDue: rev ? { cycleId: rev.cycleId, since: cycleSince.get(rev.cycleId) ?? null } : null,
      care: careRows.filter((c) => c.memberId === id && c.dueAt <= now),
      help: helpRows.filter((h) => h.memberId === id),
      items: itemRows.filter((r) => r.memberId === id),
    }).filter((a) => a.state !== "done");
    actionsBy.set(id, list);
  }
  // Κάρτες προσοχής: ανά μέλος· σοβαρά πρώτα.
  type Attn = { id: string; issues: Issue[]; actions: ActionView[]; latest: number; red: boolean };
  const attention: Attn[] = [];
  for (const id of memberIds) {
    const box = boxes.find((b) => b.id === id);
    const f = (flags.get(id) ?? []).filter((x) => (x.level === "red" || x.key === "risk_review" || x.key === "no_contact") && !inBox.has(`${id}:${x.key}`));
    const issues: Issue[] = [
      ...(box ? box.items.map((a) => ({ text: a.text, at: a.createdAt, href: alertHref(id, a), by: `${a.sourceLabel}, ${a.by}`, red: !a.mild })) : []),
      ...f.filter((x) => x.key !== "risk_review").map((x) => ({ text: x.text, at: x.at, href: x.href, red: x.level === "red" })),
    ];
    const acts = (actionsBy.get(id) ?? []).filter((a) => a.kind !== "cycle_review" && a.kind !== "care");
    // Η αφορμή «θέλει αξιολόγηση» φαίνεται ως ενέργεια (με ανάληψη), όχι ως δεύτερη γραμμή σήματος.
    if (issues.length === 0 && acts.length === 0) continue;
    issues.sort((a, b) => Number(b.red) - Number(a.red) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
    attention.push({ id, issues, actions: acts, latest: Math.max(0, ...issues.map((i) => i.at?.getTime() ?? 0)), red: issues.some((i) => i.red) });
  }
  attention.sort((a, b) => Number(b.red) - Number(a.red) || b.latest - a.latest);

  // Εκκρεμότητες: σημειώματα που δεν γράφτηκαν, ανασκοπήσεις κύκλου, μηνύματα φροντίδας (με ανάληψη).
  const notesDue = items.filter((it) => it.endsAt <= now && !it.hasNote);
  const todoActions = memberIds.flatMap((id) => (actionsBy.get(id) ?? []).filter((a) => a.kind === "cycle_review" || a.kind === "care"));
  const todoCount = notesDue.length + todoActions.length;
  const roleLabel = user.role === "ADMIN" ? "διαχείριση" : (KIND_LABEL[user.therapistKind ?? ""] ?? "θεραπευτής");
  // Αν το όνομα έχει ήδη τον ρόλο σε παρένθεση (ψεύτικα στοιχεία), δεν τον ξαναγράφουμε.
  const who = /\(/.test(user.name) ? user.name : `${user.name}, ${roleLabel}`;

  // «Συνέχεια από την ομάδα»: πριν από την επόμενη ατομική, το τελευταίο σημείωμα (συντάκτης, ημερομηνία, προεπισκόπηση).
  const next = items.find((it) => it.key === nextKey);
  const nextNote = next?.memberId ? (await memberNotes(next.memberId, { before: next.startsAt, take: 1 }))[0] ?? null : null;
  const nextIsSession = Boolean(next?.memberId);

  return (
    <main className="wide">
      <Announcements />
      <StaffMessagesLine userId={user.id} />
      <PageHead title={isToday ? "Σήμερα" : formatDate(date)} sub={<>{isToday && `${formatDate(date)} · `}{who}</>}>
        <DayPicker date={date} today={today} prev={addDays(date, -1)} next={addDays(date, 1)} prevWeek={addDays(date, -7)} nextWeek={addDays(date, 7)} base="/t" />
      </PageHead>

      {holiday && <div className="notice">Αργία ({holiday.reason}): δεν γίνονται ατομικές{holiday.groupTime ? ` · ομάδα στη θέση τους στις ${holiday.groupTime}` : ""}.</div>}
      <div className="cols cols-60">
        <div className="stackv">
          <Panel title="Το πρόγραμμά μου" link={{ href: "#week", label: "Επόμενες ημέρες" }} tour="program">
            <div className="sched">
              {items.map((it) => {
                const st = statusOf(it);
                const isNext = it.key === nextKey;
                const ended = it.endsAt <= now;
                return (
                  <div key={it.key} className={`sched-item${isNext ? " next" : ""}${ended ? " past" : ""}`}>
                    <span className="iconbox"><Icon name={it.icon} size={isNext ? 28 : 22} /></span>
                    <div>
                      {isNext && <div style={{ marginBottom: 6 }}><Pill tone="solid" icon="clock">{st.text}</Pill></div>}
                      <div className="sched-time">
                        {!isNext && <Icon name="clock" size={18} />}
                        {formatTime(it.startsAt)} – {formatTime(it.endsAt)}
                      </div>
                      <div className="sched-kind">{it.kind} · <Link href={it.href}>{it.title}</Link></div>
                      <div className="sched-status">
                        {!isNext && <Pill tone={st.tone === "solid" ? "" : st.tone}>{st.text}</Pill>}
                        {it.memberJoinedAt && <span>Το μέλος πάτησε «Μπες» {formatTime(it.memberJoinedAt)}</span>}
                        {isToday && !ended && it.opensForMembersAt > now && <span>Η είσοδος των μελών ανοίγει στις {formatTime(it.opensForMembersAt)}</span>}
                      </div>
                    </div>
                    <div className="sched-actions">
                      {isNext && isToday ? (
                        <>
                          <JoinButton kind={it.join.kind} refId={it.join.ref} roomUrl={it.join.room} next={it.href} label={it.join.label} className="primary lg" icon="video" />
                          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <Link href={it.href} className="btn outline sm" style={{ flex: 1 }}>{it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Προετοιμασία"}</Link>
                            {it.memberHref && <Link href={it.memberHref} className="btn outline sm" style={{ flex: 1 }}><Icon name="folder" size={16} /> Φάκελος</Link>}
                          </div>
                        </>
                      ) : ended ? (
                        <Link href={it.href} className="btn outline sm">{it.hasNote ? "Άνοιγμα" : it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Γράψε σημείωμα"}</Link>
                      ) : (
                        <>
                          <Link href={it.href} className="btn outline">{it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Προετοιμασία"}</Link>
                          {isToday && <JoinButton kind={it.join.kind} refId={it.join.ref} roomUrl={it.join.room} next={it.href} label={it.join.label} className="outline sm" />}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <EmptyState>Δεν έχεις ομάδα ή ατομική {isToday ? "σήμερα" : "αυτή τη μέρα"}.</EmptyState>}
            </div>
            <details className="fold small" style={{ marginTop: 14 }} data-tour="legend">
              <summary className="muted">Πώς δουλεύουν τα κουμπιά και οι ενδείξεις</summary>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                «Μπες» ανοίγει το Zoom σε νέα καρτέλα, καταγράφει την ώρα που το πάτησες και φέρνει εδώ τη σελίδα της συνεδρίας. «Το μέλος πάτησε «Μπες»» είναι η ώρα του πατήματος· δεν είναι επιβεβαίωση συμμετοχής από το Zoom.
                Μια συνεδρία που πέρασε η ώρα της μένει «εκκρεμεί καταγραφή» μέχρι να υπάρξει «Μπες» ή σημείωμα· δεν θεωρείται απουσία. Το σημειωματάριο ανοίγει 15 λεπτά πριν.
              </p>
            </details>
            {isToday && isDemoSite() && (
              <form action={demoStart} className="row" style={{ marginTop: 12, gap: 10 }}>
                <span className="hint">Δοκιμαστικό περιβάλλον</span>
                <button type="submit" className="sm" title="Φτιάχνει μια ατομική τώρα με ψεύτικο μέλος, για να δεις πώς συνδέεσαι και τι βλέπεις μέσα στην ατομική">Ξεκίνα δοκιμαστική ατομική τώρα</button>
              </form>
            )}
          </Panel>

          {isToday && nextIsSession && next && (
            <Panel title="Συνέχεια από την ομάδα">
              <p className="hint" style={{ margin: "0 0 10px" }}>Πριν από την επόμενη ατομική ({next.title}): δες το τελευταίο σημείωμα και τις ανοιχτές συμφωνίες.</p>
              {nextNote ? (
                <NoteSummary author={nextNote.therapist} at={nextNote.startsAt} text={nextNote.text} href={`${next.href}#open`} />
              ) : (
                <EmptyState>Δεν υπάρχει προηγούμενο σημείωμα για αυτό το μέλος.</EmptyState>
              )}
              <p style={{ margin: "12px 0 0" }}><Link className="btn outline" href={next.href}>Προετοιμασία της ατομικής</Link></p>
            </Panel>
          )}

          <Panel title="Τις επόμενες 7 μέρες" id="week" tour="week">
            {[
              ...myGroups.filter((g) => g.date > date).map((g) => ({ key: `${g.date}${g.time}`, sort: `${g.date} ${g.time}`, date: g.date, when: `${formatDate(g.date)} ${g.time}`, sub: "Ομάδα · εσύ συντονίζεις", icon: "group" as const })),
              ...week.map((x) => ({ key: x.id, href: `/t/s/${x.id}`, sort: `${x.date} ${formatTime(x.startsAt)}`, date: x.date, when: `${formatDate(x.date)} ${formatTime(x.startsAt)}`, sub: `${x.kind === "PAIR" ? "Therapair" : "Ατομική"} · ${names(x)}`, icon: (x.kind === "PAIR" ? "group" : "user") as "group" | "user" })),
            ]
              .sort((a, b) => a.sort.localeCompare(b.sort))
              .map((r) => (
                <Link key={r.key} className="linkrow" href={"href" in r && r.href ? r.href : `/t?date=${r.date}`}>
                  <span className="iconbox"><Icon name={r.icon} size={20} /></span>
                  <span className="grow"><div style={{ fontWeight: 600 }}>{r.when}</div><div className="hint">{r.sub}</div></span>
                  <span className="arrow"><Icon name="chevron" /></span>
                </Link>
              ))}
            {week.length === 0 && myGroups.filter((g) => g.date > date).length === 0 && <EmptyState>Τίποτα προγραμματισμένο τις επόμενες 7 μέρες.</EmptyState>}
          </Panel>
        </div>

        <div className="stackv">
          <Panel tour="see">
            <div className="panel-head">
              <h2>Χρειάζεται προσοχή</h2>
              <span className="hint">{attention.length === 0 ? "τίποτα ανοιχτό" : `${attention.length} ${attention.length === 1 ? "μέλος" : "μέλη"}`}</span>
            </div>
            <div data-tour="alerts">
              {attention.map((a) => (
                <AttentionCard key={a.id} memberId={a.id} memberName={memberName.get(a.id) ?? "Μέλος"} issues={a.issues} actions={a.actions} viewer={viewer} staff={staff} back={isToday ? "/t" : `/t?date=${date}`} />
              ))}
            </div>
            {attention.length === 0 && <EmptyState>Κανένα ανοιχτό θέμα αυτή τη στιγμή.</EmptyState>}
            <details className="fold small" style={{ marginTop: 12 }}>
              <summary className="muted">Τι σημαίνουν οι ενδείξεις</summary>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                <strong>Σοβαρό σήμα</strong>: χρειάζεται ενέργεια. <strong>Να το δεις</strong>: για την επόμενη επαφή. Η ειδοποίηση των 24 ωρών είναι ειδοποίηση: όταν φύγει από εδώ, το θέμα δεν έχει λυθεί μόνο του — η ενέργεια μένει ανοιχτή μέχρι να ολοκληρωθεί, και τα σήματα μένουν στο «Ασφάλεια» του φακέλου όσο ισχύουν.
                «Το είδα», «Το ανέλαβα» και «Ολοκληρώθηκε» είναι διαφορετικά: η ανάγνωση δεν ολοκληρώνει την ενέργεια.
              </p>
            </details>
          </Panel>

          <Panel title="Εκκρεμότητες">
            <div className="hint" style={{ marginTop: -6, marginBottom: 8 }}>{todoCount === 0 ? "καμία" : `${todoCount}`}</div>
            {notesDue.map((it) => (
              <Link key={`n${it.key}`} className="todo" href={it.href}>
                <span className="iconbox"><Icon name="doc" /></span>
                <span className="todo-body"><div className="todo-title">Σημείωμα: {it.kind} · {it.title}</div><div className="todo-sub">{formatTime(it.startsAt)} · η προγραμματισμένη ώρα πέρασε — εκκρεμεί καταγραφή · θεραπευτής: {user.name.replace(/ \(.*/, "")}</div></span>
                <span className="arrow"><Icon name="chevron" /></span>
              </Link>
            ))}
            {todoActions.map((a) => <ActionRow key={a.key} a={a} viewer={viewer} staff={staff} back={isToday ? "/t" : `/t?date=${date}`} showMember />)}
            {todoCount === 0 && <EmptyState>Καμία εκκρεμότητα.</EmptyState>}
          </Panel>
        </div>
      </div>
      <TourFor id="today" userId={user.id} />
    </main>
  );
}
