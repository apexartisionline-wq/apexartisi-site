import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { DayPicker } from "@/components/DayPicker";
import { StaffMessagesLine } from "@/components/StaffMessagesLine";
import { JoinButton } from "@/components/JoinButton";
import { DemoStartButton } from "@/components/DemoStartButton";
import { roomUrl, ROOM_MISSING } from "@/lib/rooms";
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
import { fetchCare, fetchItemRows, fetchOpenHelp, fetchStepsToRead } from "@/lib/actions";
import { autoCloseCycles } from "@/lib/cycle-review";
import { groupDays } from "@/lib/groups";
import { memberSafetyMany } from "@/lib/safety-batch";
import { memberNotes } from "@/lib/member-notes";
import { sessionPresence } from "@/lib/presence";
import { getSettings } from "@/lib/settings";
import { demoSecondCandidate, ensureDemoToday, isDemoSite, startDemoFirstSession, startDemoSecondSession, startDemoSession } from "@/lib/demo-session";
import { addDays, athensToUtc, formatDate, formatTime, localParts, toMinutes } from "@/lib/time";
import { mottoFor } from "@/lib/mottos";
import { sessionOrders } from "@/lib/session-order-db";
import { vocative } from "@/lib/vocative";

// Μόνο στη δοκιμαστική εγκατάσταση: φτιάχνει μια ατομική «τώρα» με ψεύτικο μέλος, για να δοκιμάσει κανείς τη σύνδεση.
async function demoStart() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = await startDemoSession(user).catch((e) => { console.error("[demo]", e); return null; });
  redirect(id ? `/t?demo=${id}` : "/t?demo=0");
}
// …και «Δοκιμαστική 1η ατομική»: νέο ψεύτικο μέλος χωρίς ιστορικό (16/10).
async function demoFirst() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = await startDemoFirstSession(user).catch((e) => { console.error("[demo-first]", e); return null; });
  redirect(id ? `/t?demo=${id}` : "/t?demo=0");
}

// …και «Δοκιμαστική 2η ατομική»: το ίδιο ψεύτικο μέλος, μετά το ιστορικό, για το πλάνο υποστήριξης (17/10).
async function demoSecond() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = await startDemoSecondSession(user).catch((e) => { console.error("[demo-second]", e); return null; });
  redirect(id ? `/t?demo=${id}` : "/t?demo=0");
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
  order?: string; // «2η ατομική · πλάνο υποστήριξης» (17/10, μόνο ατομική)
  href: string;
  memberHref?: string; // φάκελος (μόνο στην ατομική)
  memberId?: string;
  prepHref?: string; // «Προετοιμασία» (14/10): μόνο ατομική/Therapair
  hasNote: boolean;
  memberJoinedAt: Date | null; // πάτησε «Μπες» το μέλος (μόνο ατομική)
  memberConfirmed: boolean | null; // επιβεβαίωση θεραπευτή «Ήρθε/Δεν ήρθε» (μόνο ατομική)
  join: { kind: "SLOT" | "GROUP"; ref: string; room: string; label: string };
  opensForMembersAt: Date;
};

// «Σήμερα»: το κεντρικό σημείο της μέρας του θεραπευτή (ανασχεδιασμός 13/10, 2ο πέρασμα — εγκεκριμένη εικόνα «Σήμερα»).
// Αριστερά (~60%) το πρόγραμμα με την επόμενη συνεδρία ως πρώτο σημείο αναφοράς, δεξιά (~40%) «Χρειάζεται προσοχή» και «Εκκρεμότητες».
export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string; demo?: string }> }) {
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
      include: { bookings: { include: { member: { select: { id: true, name: true } } } } },
      orderBy: [{ date: "asc" }, { hour: "asc" }],
    }),
    groupDays(date, addDays(date, 7), s),
    prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true } }),
    user.role === "ADMIN" ? prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true, name: true, therapistKind: true, role: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.holiday.findUnique({ where: { date } }),
  ]);
  // Αρίθμηση ατομικών και βήμα πρωτοκόλλου (17/10): «2η ατομική · πλάνο υποστήριξης» — μία φόρτωση για όλες τις ατομικές
  // της ημέρας και της εβδομάδας (όχι Therapair). Κανόνας: src/lib/session-order.ts.
  const orders = await sessionOrders(
    [...slots, ...week].filter((x) => x.kind !== "PAIR" && x.bookings.length === 1).map((x) => ({ id: x.id, startsAt: x.startsAt, memberId: x.bookings[0].member.id })),
  );
  const orderLabel = (x: { id: string }) => orders.get(x.id)?.label;
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
        join: { kind: "GROUP" as const, ref: `${g.date} ${g.time}`, room: roomUrl(s.groupRoomUrl), label: "Μπες στην ομάδα" },
        opensForMembersAt: joinBefore(startsAt, s.groupJoinBeforeMinutes),
      };
    }),
    ...slots.map((x) => {
      const pair = x.kind === "PAIR";
      return {
        key: x.id, startsAt: x.startsAt, endsAt: new Date(x.startsAt.getTime() + (pair ? s.pairMinutes : s.sessionMinutes) * 60_000),
        kind: (pair ? "Therapair" : "Ατομική") as "Ατομική" | "Therapair", icon: (pair ? "group" : "user") as "user" | "group", title: short(x), order: pair ? undefined : orderLabel(x),
        href: `/t/s/${x.id}`, prepHref: `/t/s/${x.id}/prep`, memberHref: !pair && x.bookings[0] ? `/t/members/${x.bookings[0].member.id}` : undefined, memberId: !pair ? x.bookings[0]?.member.id : undefined,
        hasNote: pair ? x.pairNotes.length > 0 : Boolean(x.note), memberJoinedAt: !pair ? (x.bookings[0]?.joinedAt ?? null) : null, memberConfirmed: !pair ? (x.bookings[0]?.confirmedCame ?? null) : null,
        join: { kind: "SLOT" as const, ref: x.id, room: roomUrl(s.rooms[x.position - 1]), label: pair ? "Μπες στο Therapair" : "Μπες στην ατομική" },
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
  const [flagsAll, reviews, itemRows, careRows, helpRows, stepRows] = await Promise.all([
    // Όλα τα μέλη μαζί, με λίγες ερωτήσεις (15/10): ανά μέλος το «Σήμερα» ξεπερνούσε το όριο των 10″ του Netlify.
    memberSafetyMany(memberIds, now),
    // Κύκλοι που ολοκληρώθηκαν κλείνουν μόνοι τους (17/10)· μένει υπενθύμιση μόνο αν κάτι δεν έκλεισε.
    autoCloseCycles(memberIds, now),
    fetchItemRows(memberIds, now),
    // Ό,τι αφορά τη διαχείριση (τηλεφωνήματα, νέος κύκλος) το βλέπει μόνο η διαχείριση (υπεύθυνη 17/10)· οι θεραπευτές βλέπουν τα σήματα.
    fetchCare(memberIds, { includeAdminKinds: user.role === "ADMIN" }),
    fetchOpenHelp(memberIds),
    fetchStepsToRead(memberIds),
  ]);
  const flags = flagsAll;
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
      riskTrigger: rr?.at ? { at: rr.at, text: (rr as { trigText?: string }).trigText ?? "νέα αφορμή", dueAt: (rr as { dueAt?: Date }).dueAt ?? null } : null,
      initialAssessmentMissing: !assessed.has(id) && upcoming.has(id) ? { detail: "δεν έχει γίνει ακόμα · στην επόμενη ατομική με ψυχολόγο", since: null } : null,
      cycleReviewDue: rev ? { cycleId: rev.cycleId, since: cycleSince.get(rev.cycleId) ?? null } : null,
      care: careRows.filter((c) => c.memberId === id && c.dueAt <= now),
      help: helpRows.filter((h) => h.memberId === id),
      items: itemRows.filter((r) => r.memberId === id),
      stepsToRead: stepRows.filter((r) => r.memberId === id),
    }).filter((a) => a.state !== "done");
    actionsBy.set(id, list);
  }
  // Κάρτες προσοχής: ανά μέλος· σοβαρά πρώτα.
  type Attn = { id: string; issues: Issue[]; actions: ActionView[]; latest: number; red: boolean };
  const attention: Attn[] = [];
  for (const id of memberIds) {
    const box = boxes.find((b) => b.id === id);
    const f = (flags.get(id) ?? []).filter((x) => (x.level === "red" || x.key === "risk_review" || x.key === "no_contact" || x.key === "craving" || x.key === "new_member") && !inBox.has(`${id}:${x.key}`));
    const issues: Issue[] = [
      ...(box ? box.items.map((a) => ({ text: a.text, at: a.createdAt, href: alertHref(id, a), by: `${a.sourceLabel}, ${a.by}`, red: !a.mild })) : []),
      // Η αφορμή «θέλει αξιολόγηση» φαίνεται ως ενέργεια· μόνο όταν είναι ΕΚΠΡΟΘΕΣΜΗ (απόφαση 14/10) γίνεται και κόκκινη γραμμή.
      ...f.filter((x) => x.key !== "risk_review" || x.level === "red").map((x) => ({ text: x.text, at: x.at, href: x.href, red: x.level === "red" })),
    ];
    // Η αρχική αξιολόγηση δεν είναι «εκκρεμότητα» (υπεύθυνη 17/10): τη βάζει το πρωτόκολλο μέσα στην 1η ατομική, όποιος την έχει.
    const acts = (actionsBy.get(id) ?? []).filter((a) => a.kind !== "cycle_review" && a.kind !== "care" && a.kind !== "initial_assessment");
    // Η αφορμή «θέλει αξιολόγηση» φαίνεται ως ενέργεια (με ανάληψη), όχι ως δεύτερη γραμμή σήματος.
    if (issues.length === 0 && acts.length === 0) continue;
    issues.sort((a, b) => Number(b.red) - Number(a.red) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
    attention.push({ id, issues, actions: acts, latest: Math.max(0, ...issues.map((i) => i.at?.getTime() ?? 0)), red: issues.some((i) => i.red) });
  }
  attention.sort((a, b) => Number(b.red) - Number(a.red) || b.latest - a.latest);

  // Εκκρεμότητες: σημειώματα που δεν γράφτηκαν, ανασκοπήσεις κύκλου, μηνύματα φροντίδας (με ανάληψη).
  const notesDue = items.filter((it) => it.endsAt <= now && !it.hasNote);
  // Πίνακας ομάδας (υπεύθυνη 17/10: «ένας πίνακας κοινοποιήσεων πληροφοριών θεραπείας, ώστε όλοι οι θεραπευτές να έχουν
  // κοινή εικόνα σε όσα χρειάζεται να ξέρουν άμεσα — υποτροπή, τρεις συνεχόμενες απουσίες, κόκκινο κουμπί»): μία γραμμή ανά
  // γεγονός, τα σοβαρά πρώτα και μετά τα πιο πρόσφατα, ΧΩΡΙΣ κουμπιά ενεργειών (οι ενέργειες με ανάληψη πάνε στις «Εκκρεμότητες»).
  const board = attention
    .flatMap((a) => a.issues.map((i) => ({ memberId: a.id, memberName: memberName.get(a.id) ?? "Μέλος", ...i })))
    .sort((a, b) => Number(b.red) - Number(a.red) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  const boardMembers = new Set(board.map((b) => b.memberId)).size;
  // Εκκρεμότητες: όλες οι ενέργειες με ανάληψη (αξιολόγηση αναγκών, βήμα προς ανάγνωση, κόκκινο κουμπί, κύκλος, φροντίδα).
  const todoActions = memberIds.flatMap((id) => actionsBy.get(id) ?? []);
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
      {/* Καλωσόρισμα με όνομα και μότο της ημέρας (υπεύθυνη 17/10)· σε άλλη μέρα, η ημερομηνία. */}
      <PageHead title={isToday ? `Καλώς ήρθες, ${vocative(user.name.split(" ")[0])}` : formatDate(date)} sub={<>{formatDate(date)} · {who}{isToday && <><br /><span className="motto">{mottoFor(today)}</span></>}</>}>
        <DayPicker date={date} today={today} prev={addDays(date, -1)} next={addDays(date, 1)} prevWeek={addDays(date, -7)} nextWeek={addDays(date, 7)} base="/t" />
      </PageHead>

      {holiday && <div className="notice">Αργία ({holiday.reason}): δεν γίνονται ατομικές{holiday.groupTime ? ` · ομάδα στη θέση τους στις ${holiday.groupTime}` : ""}.</div>}
      {sp.demo === "0" && <div className="error">Η δοκιμαστική ατομική δεν φτιάχτηκε. Δοκίμασε ξανά· αν επιμένει, πες το στη διαχείριση.</div>}
      {sp.demo && sp.demo !== "0" && (() => { const d = items.find((it) => it.key === sp.demo); return d ? <div className="notice">Η δοκιμαστική ατομική μπήκε στο πρόγραμμα: {formatTime(d.startsAt)}–{formatTime(d.endsAt)} με {d.title}. Πάτα «Προετοιμασία» ή «Μπες στην ατομική».</div> : <div className="notice">Η δοκιμαστική ατομική φτιάχτηκε.</div>; })()}
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
                      <div className="sched-kind">{it.order ?? it.kind} · <Link href={it.href}>{it.title}</Link></div>
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
                          {!it.join.room && <span className="hint" title={ROOM_MISSING}>Δωμάτιο: δεν έχει οριστεί{user.role === "ADMIN" && <> · <Link href="/admin/settings">Ρυθμίσεις</Link></>}</span>}
                          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <Link href={it.prepHref ?? it.href} className="btn outline sm" style={{ flex: 1 }}>{it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Προετοιμασία"}</Link>
                            {it.memberHref && <Link href={it.memberHref} className="btn outline sm" style={{ flex: 1 }}><Icon name="folder" size={16} /> Φάκελος</Link>}
                          </div>
                        </>
                      ) : ended ? (
                        <Link href={it.href} className="btn outline sm">{it.hasNote ? "Άνοιγμα" : it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Γράψε σημείωμα"}</Link>
                      ) : (
                        <>
                          <Link href={it.prepHref ?? it.href} className="btn outline">{it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Προετοιμασία"}</Link>
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
                «Προετοιμασία» ανοίγει μία σελίδα διαβάσματος με το προηγούμενο σημείωμα ολόκληρο, χρονόμετρο και «Μπες» — για όποιον έχει χρόνο πριν. «Μπες» ανοίγει το Zoom σε νέα καρτέλα, καταγράφει την ώρα που το πάτησες και φέρνει εδώ τη σελίδα της συνεδρίας· αν το δωμάτιο δεν έχει οριστεί, το λέει και δεν ανοίγει τίποτα. «Το μέλος πάτησε «Μπες»» είναι η ώρα του πατήματος· δεν είναι επιβεβαίωση συμμετοχής από το Zoom.
                Μια συνεδρία που πέρασε η ώρα της μένει «εκκρεμεί καταγραφή» μέχρι να υπάρξει «Μπες» ή σημείωμα· δεν θεωρείται απουσία. Το σημειωματάριο ανοίγει 15 λεπτά πριν.
                <strong>Το σημείωμα δεν μένει για αργότερα:</strong> μόλις τελειώσει μια συνεδρία σου χωρίς σημείωμα, το Apex σε κρατά σε αυτήν μέχρι να το γράψεις («Ήρθε» ή «Δεν ήρθε»). Μόνο όσο τρέχει η επόμενη συνεδρία ή ομάδα σου περιμένει.
              </p>
            </details>
            {isToday && isDemoSite() && (
              <div className="row" style={{ marginTop: 12, gap: 10 }}>
                <span className="hint">Δοκιμαστικό περιβάλλον</span>
                <form action={demoStart}><DemoStartButton /></form>
                <form action={demoFirst}><DemoStartButton first /></form>
                {await (async () => { const c = await demoSecondCandidate(); return c ? <form action={demoSecond}><DemoStartButton second={c.name.split(" ")[0]} /></form> : null; })()}
              </div>
            )}
          </Panel>

          {isToday && nextIsSession && next && (
            <Panel title="Συνέχεια από την ομάδα">
              <p className="hint" style={{ margin: "0 0 10px" }}>Πριν από την επόμενη ατομική ({next.title}): δες το τελευταίο σημείωμα και τις ανοιχτές συμφωνίες.</p>
              {nextNote ? (
                <NoteSummary author={nextNote.therapist} at={nextNote.startsAt} text={nextNote.text} href={`${next.prepHref ?? next.href}#note`} />
              ) : (
                <EmptyState>Δεν υπάρχει προηγούμενο σημείωμα για αυτό το μέλος.</EmptyState>
              )}
              <p style={{ margin: "12px 0 0" }}><Link className="btn outline" href={next.prepHref ?? next.href}>Προετοιμασία της ατομικής</Link></p>
            </Panel>
          )}

          <Panel title="Τις επόμενες 7 μέρες" id="week" tour="week">
            {[
              ...myGroups.filter((g) => g.date > date).map((g) => ({ key: `${g.date}${g.time}`, sort: `${g.date} ${g.time}`, date: g.date, when: `${formatDate(g.date)} ${g.time}`, sub: "Ομάδα · εσύ συντονίζεις", icon: "group" as const })),
              ...week.map((x) => ({ key: x.id, href: `/t/s/${x.id}`, sort: `${x.date} ${formatTime(x.startsAt)}`, date: x.date, when: `${formatDate(x.date)} ${formatTime(x.startsAt)}`, sub: `${x.kind === "PAIR" ? "Therapair" : (orderLabel(x) ?? "Ατομική")} · ${names(x)}`, icon: (x.kind === "PAIR" ? "group" : "user") as "group" | "user" })),
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
              <h2>Πίνακας ομάδας</h2>
              <span className="hint">{board.length === 0 ? "τίποτα νέο" : `${board.length} ${board.length === 1 ? "γεγονός" : "γεγονότα"} · ${boardMembers} ${boardMembers === 1 ? "μέλος" : "μέλη"}`}</span>
            </div>
            <p className="hint" style={{ margin: "-4px 0 8px" }}>Κοινή εικόνα για όλη την ομάδα: ό,τι χρειάζεται να ξέρουμε άμεσα, από όποιον κι αν το κατέγραψε.</p>
            <div data-tour="alerts" className="board">
              {board.map((b, k) => (
                <div key={`${b.memberId}-${k}`} className={`board-row${b.red ? " red" : ""}`}>
                  <span className={`board-dot ${b.red ? "red" : "yellow"}`} aria-label={b.red ? "Σοβαρό" : "Να το δεις"} />
                  <div className="board-body">
                    <div className="board-text"><Link href={`/t/members/${b.memberId}`}>{b.memberName}</Link> — {b.href ? <Link href={b.href}>{b.text}</Link> : b.text}</div>
                    <div className="board-meta">{b.at ? formatDate(localParts(b.at).date) : ""}{b.by ? ` · ${b.by}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {board.length === 0 && <EmptyState>Τίποτα νέο για την ομάδα αυτή τη στιγμή.</EmptyState>}
            <details className="fold small" style={{ marginTop: 12 }}>
              <summary className="muted">Τι ανάβει εδώ</summary>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                <strong>Κόκκινο</strong>: κάτι που θέλει ενέργεια τώρα — πάτησε το κόκκινο κουμπί, υποτροπή ή χρήση στο σημείωμα ή στο ημερολόγιο, σκέψεις να κάνει κακό στον εαυτό του, αυξήθηκαν ή είναι υψηλές οι ανάγκες ασφάλειας, δεν ήρθε μετά από σήμα ασφάλειας.
                <strong> Κίτρινο</strong>: για την επόμενη επαφή — μέρες χωρίς καμία επαφή μαζί μας, έντονες επιθυμίες στο ημερολόγιο, νέο μέλος στις πρώτες του μέρες, αυξημένες ανάγκες ασφάλειας.
                Ανάβει μόλις το γράψει όποιος από την ομάδα, και μένει όσο ισχύει· τα παλιά μένουν στο «Ασφάλεια» του φακέλου. Οι ενέργειες με ανάληψη είναι από κάτω, στις «Εκκρεμότητες».
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
