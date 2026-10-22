import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { GoalDays } from "@/components/GoalDays";
import { Icon } from "@/components/Icon";
import { PageHead, Panel, Pill } from "@/components/ui";
import { memberConsents, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { withMemberCode } from "@/lib/forms";
import { ensureDemoToday } from "@/lib/demo-session";
import { isPublished, journalDate } from "@/lib/member";
import { sessionOrders } from "@/lib/session-order-db";
import { extraGroupTimes, holidaysFrom } from "@/lib/groups";
import { bookingWindow, canRequestChange, groupsOn, isAfter, joinableGroup, sessionJoinable, slotMinutes } from "@/lib/program";
import { gr } from "@/lib/assessment";
import { goalWeek } from "@/lib/goals";
import { dayTimeline, type DayItem } from "@/lib/member-day";
import { soberDays } from "@/lib/note-form";
import { latestAnswers } from "@/lib/theme-forms";
import { getPlan, hasPlanContent } from "@/lib/safety";
import { memberStepStatus } from "@/lib/step-modes";
import { getSettings } from "@/lib/settings";
import { ROOM_MISSING_MEMBER } from "@/lib/rooms";
import { vocative } from "@/lib/vocative";
import { addDays, athensToUtc, formatDate, formatTime, isAfterLocal, localParts } from "@/lib/time";

export default async function MemberHome({ searchParams }: { searchParams: Promise<{ e?: string; req?: string }> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now);
  const window = bookingWindow(now, s);

  await ensureDemoToday();
  const [contents, upcoming, journal, attended, requests, consents, todayBookings] = await Promise.all([
    prisma.content.findMany({ where: { date: today.date }, orderBy: { title: "asc" }, omit: { image: true } }),
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.pairMinutes * 60_000) } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
      take: 4,
    }),
    s.journalFormUrl
      ? Promise.resolve(null)
      : prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date: journalDate(now, s) } } }),
    prisma.attendance.findUnique({ where: { memberId_date: { memberId: user.id, date: today.date } } }),
    prisma.changeRequest.findMany({
      where: { memberId: user.id, OR: [{ status: "PENDING" }, { handledAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }] },
      orderBy: { createdAt: "desc" },
    }),
    memberConsents(user.id),
    // Τα ραντεβού της ημέρας, και όσα πέρασαν, για «Η μέρα σου».
    prisma.booking.findMany({ where: { memberId: user.id, slot: { date: today.date } }, include: { slot: true } }),
  ]);

  // Η πορεία του με θετικό πρόσημο (υπεύθυνη 20/10: όχι «Μήνας Χ» ούτε «Χ από 8» στην αρχική — θυμίζουν χρέωση και
  // αντίστροφη μέτρηση και αγχώνουν): μόνο πόσες ατομικές έχει κάνει με παρουσία από την αρχή (ίδιος κανόνας παρουσίας με
  // την ομάδα: η επιβεβαίωση του σημειώματος υπερισχύει, αλλιώς το δικό του «Μπες»). Ο στόχος της εβδομάδας με τα λόγια του.
  // «6η ατομική» στις επόμενες (όχι «6 από 8»)· ίδιος κανόνας αρίθμησης με την ομάδα (session-order.ts).
  const orders = await sessionOrders(upcoming.filter((b) => b.slot.kind === "INDIVIDUAL").map((b) => ({ id: b.slot.id, startsAt: b.slot.startsAt, memberId: user.id })));
  const [doneSessions, gw, nextCount, plan, openTask, weekBooked] = await Promise.all([
    prisma.booking.count({ where: { memberId: user.id, slot: { kind: "INDIVIDUAL", startsAt: { lt: now } }, OR: [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }] } }),
    // Ο στόχος της εβδομάδας με τα 7 βραδινά τσεκαρίσματα (goals.ts).
    goalWeek(user.id, today.date),
    // «Επόμενα»: όσα ραντεβού έχει κλεισμένα μπροστά του (όλα, όχι μόνο του τρέχοντος κύκλου), ώστε αριθμός και κάρτες να συμφωνούν.
    prisma.booking.count({ where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.pairMinutes * 60_000) } } } }),
    // «Το πλάνο μου όταν δυσκολεύομαι»: μία ήρεμη γραμμή στο «Σήμερα» όταν υπάρχει (21/10)· όχι κόκκινο, το κόκκινο κουμπί μένει για την κρίση.
    getPlan(user.id),
    // Η πιο πρόσφατη ανοιχτή εργασία/βήμα από τη διαχείριση (21/10 — το «Today's challenges» του Affect μεταφράζεται στις υπάρχουσες εργασίες)· χωρίς τα bytes των PDF.
    prisma.assignment.findFirst({ where: { memberId: user.id, answeredAt: null, notebookAt: null, answerPdfAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, step: true, mode: true, answeredAt: true, notebookAt: true, answerPdfAt: true } }),
    // Κρατήσεις της εβδομάδας κράτησης — ίδιος κανόνας με τη σελίδα «Ραντεβού» (ώστε η κάρτα να μη ζητά κράτηση όταν έχει κλείσει όλες τις ώρες).
    prisma.booking.count({ where: { memberId: user.id, slot: { date: { gte: window.weekStart, lte: window.weekEnd } } } }),
  ]);
  const goal = gw.goal;
  const hasPlan = Boolean(plan && hasPlanContent(plan));
  const taskStatus = openTask ? memberStepStatus(openTask) : null;
  const left = Math.max(0, s.sessionsPerWeek - weekBooked);
  const unreadMessage =
    (await prisma.monthlyMessage.findFirst({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, select: { id: true } })) ??
    (await prisma.closure.findFirst({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, select: { id: true } }));
  const text = contents.find((c) => c.kind === "DAILY_TEXT" && isPublished(c.date, s.dailyTextTime, now));
  const forms = contents.filter((c) => c.kind === "FORM" && isPublished(c.date, s.formsTime, now));
  // Και έκτακτη ομάδα της ημέρας (π.χ. σε αργία, στη θέση των ατομικών).
  const [extraToday, holidays] = await Promise.all([extraGroupTimes(today.date, s), holidaysFrom(today.date, addDays(today.date, 7))]);
  const groupsToday = [...groupsOn(today.date, s).map((g) => ({ time: g.time })), ...extraToday.map((time) => ({ time }))].sort((a, b) => a.time.localeCompare(b.time));
  const groupOpen = joinableGroup(now, s, extraToday);
  const journalOpen = isAfter(now, s.journalTime);
  const pendingFor = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.bookingId));

  // «Τώρα» (21/10 — ιδέα από το «Today / Check in today» των εφαρμογών ανάκαμψης που έδειξε η υπεύθυνη): μία κάρτα πάνω-πάνω
  // με τη μία ενέργεια της στιγμής, μόνο από τα δεδομένα που ήδη φορτώνει η σελίδα. Σειρά: ατομική/Therapair που ανοίγει →
  // ομάδα που ανοίγει → ημερολόγιο που άνοιξε και δεν συμπληρώθηκε → το επόμενο της ημέρας (με «σε Χ ώρες») → το επόμενο
  // ραντεβού → κράτηση αν είναι ανοιχτή. Οι κάρτες από κάτω μένουν όπως είναι (πλήρες πρόγραμμα)· εδώ μόνο το «τι κάνω τώρα».
  // Με εξωτερική φόρμα ημερολογίου δεν ξέρουμε αν συμπληρώθηκε (journal πάντα null) — τότε το «Τώρα» δεν το ζητά· μένει η κάρτα του.
  const journalDue = consents.journal === "YES" && !s.journalFormUrl && journalOpen && !journal;
  const journalLink = s.journalFormUrl ? (
    <a className="btn primary" href={withMemberCode(s.journalFormUrl, user.memberCode)} target="_blank" rel="noopener noreferrer">Συμπλήρωσέ το</a>
  ) : (
    <Link className="btn primary" href="/m/journal">Συμπλήρωσέ το</Link>
  );
  const joinNow = upcoming.find((b) => sessionJoinable(b.slot.startsAt, now, s, slotMinutes(b.slot.kind, s)));
  const inWords = (at: Date) => {
    const m = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60_000));
    if (m < 60) return `σε ${m} ${m === 1 ? "λεπτό" : "λεπτά"}`;
    const h = Math.floor(m / 60);
    return `σε ${h} ${h === 1 ? "ώρα" : "ώρες"}`;
  };
  type NowCard = { kind: "session" | "group" | "journal" | "later" | "book"; bookingId?: string; title: string; hint?: string; action?: ReactNode };
  // Ό,τι άλλο έχει η μέρα μετά από τώρα (ομάδες, ατομικές, το ημερολόγιο, το κείμενο), με σειρά ώρας.
  const later: { key: string; at: Date; title: string; hint?: string }[] = [];
  for (const g of groupsToday) {
    const at = athensToUtc(today.date, ...(g.time.split(":").map(Number) as [number, number]));
    if (at > now) later.push({ key: `g:${g.time}`, at, title: `Ομάδα στις ${g.time}`, hint: `Το κουμπί ανοίγει ${s.groupJoinBeforeMinutes} λεπτά πριν.` });
  }
  for (const b of upcoming) if (b.slot.date === today.date && b.slot.startsAt > now) later.push({ key: `b:${b.id}`, at: b.slot.startsAt, title: `${b.slot.kind === "PAIR" ? "Therapair" : "Ατομική"} στις ${formatTime(b.slot.startsAt)}`, hint: `Το κουμπί ανοίγει ${s.sessionJoinBeforeMinutes} λεπτά πριν.` });
  if (consents.journal === "YES" && !journalOpen) later.push({ key: "j", at: athensToUtc(today.date, ...(s.journalTime.split(":").map(Number) as [number, number])), title: `Ημερολόγιο στις ${s.journalTime}` });
  if (!text && !isAfterLocal(today, s.dailyTextTime)) later.push({ key: "t", at: athensToUtc(today.date, ...(s.dailyTextTime.split(":").map(Number) as [number, number])), title: `«Ξεκινάμε τη μέρα παρέα» στις ${s.dailyTextTime}` });
  later.sort((a, b) => a.at.getTime() - b.at.getTime());
  let hero: NowCard | null = null;
  if (joinNow) {
    const pair = joinNow.slot.kind === "PAIR";
    hero = {
      kind: "session",
      bookingId: joinNow.id,
      title: `${pair ? "Το Therapair σου" : "Η ατομική σου"} ${joinNow.slot.startsAt <= now ? "ξεκίνησε" : "ξεκινά"} στις ${formatTime(joinNow.slot.startsAt)}`,
      hint: joinNow.joinedAt ? "Μπήκες ✓" : undefined,
      action: (
        <form action={`/m/join/${joinNow.id}`} method="post">
          <button className="primary">{pair ? "Μπες στο Therapair σου" : "Μπες στην ατομική σου"}</button>
        </form>
      ),
    };
  } else if (groupOpen) {
    hero = {
      kind: "group",
      title: `Η ομάδα ${athensToUtc(today.date, ...(groupOpen.time.split(":").map(Number) as [number, number])) <= now ? "ξεκίνησε" : "ξεκινά"} στις ${groupOpen.time}`,
      hint: attended ? "Μπήκες ✓" : undefined,
      action: (
        <form action="/m/join/group" method="post">
          <button className="primary">Μπες στην ομάδα</button>
        </form>
      ),
    };
  } else if (journalDue) {
    hero = { kind: "journal", title: "Το ημερολόγιο άνοιξε", hint: "Γράψε για τη μέρα σου.", action: journalLink };
  } else {
    const next = later[0];
    if (next) { hero = { kind: "later", title: `Σήμερα: ${next.title}`, hint: [inWords(next.at), next.hint].filter(Boolean).join(" · ") }; }
    else if (upcoming[0]) hero = { kind: "later", title: `Επόμενο: ${upcoming[0].slot.kind === "PAIR" ? "Therapair" : "ατομική"} ${upcoming[0].slot.date === addDays(today.date, 1) ? "αύριο" : formatDate(upcoming[0].slot.date)} στις ${formatTime(upcoming[0].slot.startsAt)}` };
    else if (window.open && left > 0) hero = { kind: "book", title: "Κλείσε τα ραντεβού της εβδομάδας", hint: `μέχρι τις ${formatTime(window.closesAt)}`, action: <Link className="btn primary" href="/m/book">Κλείσε ραντεβού</Link> };
  }
  // «Η μέρα σου» (υπεύθυνη 22/10: «το πρόγραμμα με βάση την ώρα», όπως ο πίνακας του site): ολόκληρη η μέρα ώρα-ώρα μέσα
  // στην κάρτα «Τώρα», στη θέση της γραμμής «Μετά σήμερα». ✓ ό,τι έκανε· ό,τι πέρασε μένει ήπιο, χωρίς κρίση.
  const hm = (hhmm: string) => athensToUtc(today.date, ...(hhmm.split(":").map(Number) as [number, number]));
  const inAppForms = forms.filter((f) => f.questions);
  const formAnswers = inAppForms.length ? await latestAnswers(user.id, inAppForms.map((f) => f.id)) : null;
  const dayItems: DayItem[] = [];
  if (text || !isAfterLocal(today, s.dailyTextTime)) dayItems.push({ key: "t", at: hm(s.dailyTextTime), title: "«Ξεκινάμε τη μέρα παρέα»", href: text ? `/m/texts/${text.id}` : undefined });
  if (s.formsDays.includes(today.weekday) || forms.length > 0) {
    dayItems.push({
      key: "f",
      at: hm(s.formsTime),
      title: "Φόρμα της θεματικής",
      href: forms.length === 1 ? `/m/texts/${forms[0].id}` : "/m/texts",
      done: inAppForms.length > 0 && inAppForms.length === forms.length && inAppForms.every((f) => formAnswers?.has(f.id)),
    });
  }
  for (const b of todayBookings) {
    const start = b.slot.startsAt.getTime();
    dayItems.push({
      key: `b:${b.id}`,
      at: b.slot.startsAt,
      opensAt: new Date(start - s.sessionJoinBeforeMinutes * 60_000),
      endsAt: new Date(start + slotMinutes(b.slot.kind, s) * 60_000),
      title: b.slot.kind === "PAIR" ? "Therapair" : "Ατομική",
      done: b.confirmedCame === true || (b.confirmedCame === null && b.joinedAt !== null),
    });
  }
  if (consents.journal === "YES") dayItems.push({ key: "j", at: hm(s.journalTime), title: "Ημερολόγιο ανάκαμψης", href: s.journalFormUrl ? undefined : "/m/journal", done: Boolean(journal) });
  for (const g of groupsToday) {
    const start = hm(g.time).getTime();
    dayItems.push({ key: `g:${g.time}`, at: hm(g.time), opensAt: new Date(start - s.groupJoinBeforeMinutes * 60_000), endsAt: new Date(start + s.groupDurationMinutes * 60_000), title: "Ομάδα", done: Boolean(attended) });
  }
  const day = dayTimeline(dayItems, now);
  const firstLater = day.findIndex((x) => x.state === "later");
  // Η γραμμή «τώρα» μπαίνει ανάμεσα σε ό,τι πέρασε και ό,τι έρχεται, όταν δεν γίνεται κάτι αυτή τη στιγμή.
  const nowMark = day.some((x) => x.state === "now") ? -1 : firstLater === -1 ? day.length : firstLater;
  // Μέρες νηφαλιότητας (υπεύθυνη 22/10, εκδοχή «ήρεμη γραμμή στο Σήμερα»): από την ημερομηνία του φακέλου· σε υποτροπή η ομάδα
  // βάζει νέα ημερομηνία και μετρά από εκεί, χωρίς «μηδενίστηκε». Χωρίς ημερομηνία δεν φαίνεται τίποτα.
  const sober = soberDays(user.soberSince, today.date);
  // Τις μέρες χωρίς ομάδα: πότε είναι η επόμενη (από τις Ρυθμίσεις, με τις αργίες της εβδομάδας) — 21/10, φράση προς έγκριση.
  let nextGroup: { date: string; time: string } | null = null;
  for (let d = 1; d <= 7 && !nextGroup; d++) {
    const date = addDays(today.date, d);
    const h = holidays.find((x) => x.date === date);
    const time = h ? h.groupTime : groupsOn(date, s)[0]?.time;
    if (time) nextGroup = { date, time };
  }
  // Το ημερολόγιο είναι η μία βραδινή ενέργεια: όταν ανοίξει και δεν έχει συμπληρωθεί (και δεν το λέει ήδη το «Τώρα»), η κάρτα του ανεβαίνει πρώτη στη δεξιά στήλη.
  const journalFirst = journalDue && hero?.kind !== "journal";
  const journalPanel = consents.journal === "YES" && (
    <Panel title="Ημερολόγιο ανάκαμψης" icon="leaf" className={journalFirst ? "m-next" : undefined}>
      {s.journalFormUrl ? (
        journalOpen ? (
          <a className="btn primary" href={withMemberCode(s.journalFormUrl, user.memberCode)} target="_blank" rel="noopener noreferrer">Συμπλήρωσέ το</a>
        ) : (
          <p className="hint" style={{ margin: 0 }}>Ανοίγει στις {s.journalTime}.</p>
        )
      ) : journal ? (
        <div className="m-row">
          <span className="grow"><Pill tone="ok" icon="check">Το συμπλήρωσες</Pill></span>
          <Link className="btn outline sm" href="/m/journal">Άλλαξέ το</Link>
        </div>
      ) : (
        journalLink
      )}
    </Panel>
  );
  return (
    <main className="m-home">
      {/* Ίδια επικεφαλίδα με την ομάδα (20/10): όνομα + ημερομηνία. Μία κύρια ενέργεια ανά κάρτα. */}
      {/* Ζεστό καλωσόρισμα (υπεύθυνη 22/10: «καλωσορίζουμε το μέλος ζεστά — καλώς ήρθες, πάμε να δούμε πώς είναι η μέρα σου —
          όχι ξερό «γεια σου»»). */}
      <PageHead title={`Καλώς ήρθες, ${vocative(user.name.split(" ")[0])}`} sub={`Πάμε να δούμε πώς είναι η μέρα σου · ${formatDate(today.date)}`} />

      <Announcements />
      {sp.e === "room" && <div className="notice">{ROOM_MISSING_MEMBER}</div>}
      {/* Μετά το «Στείλε το αίτημα» (20/10: πριν δεν φαινόταν καμία επιβεβαίωση)· το «πολύ αργά» με την ίδια πρόταση της σελίδας του αιτήματος. */}
      {sp.req === "1" && <div className="notice">Το αίτημά σου στάλθηκε ✓ Την αλλαγή την κάνει η ομάδα· θα δεις την απάντηση εδώ, στο «Σήμερα».</div>}
      {sp.e === "late" && <div className="notice">Τα αιτήματα γίνονται έως {s.changeRequestHours} ώρες πριν από το ραντεβού.</div>}
      {/* Φράση αργίας: εγκεκριμένη από την υπεύθυνη (13/10) — να μην αλλάξει χωρίς ερώτηση. */}
      {holidays.map((h) => (
        <div key={h.date} className="notice">
          {h.date === today.date ? "Σήμερα" : formatDate(h.date)}: αργία — δεν γίνονται ατομικές.{h.groupTime && ` Στη θέση τους, ομάδα στις ${h.groupTime}.`}
        </div>
      ))}
      {unreadMessage && (
        <Link href="/m/message" className="linkrow panel" style={{ marginTop: 12 }}>
          <span className="iconbox"><Icon name="chat" size={20} /></span>
          <span className="grow"><strong>Ένα μήνυμα από την ομάδα σου</strong><div className="hint">Πάτα για να το διαβάσεις</div></span>
          <span className="arrow"><Icon name="chevron" /></span>
        </Link>
      )}
      {requests.filter((r) => r.status !== "PENDING").map((r) => (
        <div className="notice" key={r.id}>
          Απάντηση στο αίτημά σου: {r.status === "DONE" ? "έγινε ✓" : "δεν ήταν δυνατό"}{r.reply && ` — ${r.reply}`}
        </div>
      ))}

      {/* «Ξεκινάμε τη μέρα παρέα» (υπεύθυνη 22/10): το κείμενο της ημέρας αμέσως μετά το καλωσόρισμα, με το ίδιο το κείμενο
          (όχι μόνο τίτλο). Χωρίς σύνδεσμο στη βιβλιοθήκη θεματικών: εκεί δεν μπαίνουν τα κείμενα της ημέρας. */}
      <Panel title="Ξεκινάμε τη μέρα παρέα" icon="sun" className="m-morning">
        {text ? (
          <>
            {text.imageMime && <Link href={`/m/texts/${text.id}`}><img src={`/api/content/${text.id}/image`} alt={text.title} className="m-morning-img" /></Link>}
            <strong className="m-morning-title">{text.title}</strong>
            {text.body && <p className="m-morning-body">{text.body.length > 420 ? `${text.body.slice(0, 420).replace(/\s+\S*$/, "")}…` : text.body}</p>}
            {text.body.length > 420 && <p style={{ margin: "6px 0 0" }}><Link href={`/m/texts/${text.id}`}>Συνέχεια ›</Link></p>}
          </>
        ) : (
          <p className="hint" style={{ margin: 0 }}>{isAfterLocal(today, s.dailyTextTime) ? "Δεν υπάρχει κείμενο για σήμερα." : `Έρχεται στις ${s.dailyTextTime}.`}</p>
        )}
      </Panel>

      {(hero || day.length > 0) && (
        <Panel title={hero ? "Τώρα" : "Η μέρα σου"} icon="clock" className="m-now">
          {hero && (
            <div className="m-row">
              <div className="grow">
                <strong>{hero.title}</strong>
                {hero.hint && <div className="hint">{hero.hint}</div>}
              </div>
              {hero.action}
            </div>
          )}
          {day.length > 0 && (
            <>
              {hero && <div className="m-day-title">Η μέρα σου</div>}
              <ol className="m-day">
                {day.map(({ item, state }, i) => (
                  <Fragment key={item.key}>
                    {i === nowMark && <li className="m-day-mark"><span className="t">{formatTime(now)}</span><span>τώρα</span></li>}
                    <li className={`s-${state}`}>
                      <span className="t">{formatTime(item.at)}</span>
                      <span className="grow">{item.href && state !== "later" ? <Link href={item.href}>{item.title}</Link> : item.title}</span>
                      <span className="st">{state === "done" ? "✓" : state === "now" ? "τώρα" : i === firstLater ? inWords(item.at) : ""}</span>
                    </li>
                  </Fragment>
                ))}
                {nowMark === day.length && <li className="m-day-mark"><span className="t">{formatTime(now)}</span><span>τώρα</span></li>}
              </ol>
            </>
          )}
        </Panel>
      )}

      {/* «Δυσκολεύεσαι τώρα;» αμέσως κάτω από το «Τώρα», με γεμάτη ασπίδα (υπεύθυνη 22/10, εκδοχή «Π1β»: «τις στιγμές που το
          χρειάζομαι δεν θέλω να περνάω πρώτα από τις ατομικές και τους κύκλους»). Accent, όχι κόκκινο — το κόκκινο μένει στο κόκκινο κουμπί. */}
      {hasPlan && (
        <Link href="/m/safety" className="linkrow panel m-plan">
          <span className="iconbox"><Icon name="shield" size={20} /></span>
          <span className="grow">
            <strong>Δυσκολεύεσαι τώρα;</strong>
            <div className="hint">Το σχέδιο ασφάλειάς σου, με τα δικά σου λόγια</div>
          </span>
          <span className="arrow"><Icon name="chevron" /></span>
        </Link>
      )}


      <div className="m-grid">
        <div>
          <Panel title="Η πορεία σου" icon="chart">
            <div className="whereami">
              {sober !== null && (
                <div>
                  <strong>{sober === 0 ? "Σήμερα" : `${sober.toLocaleString("el-GR")} ${sober === 1 ? "μέρα" : "μέρες"}`}</strong>
                  <div className="hint">{sober === 0 ? "η πρώτη μέρα της νηφαλιότητάς σου" : `νηφαλιότητας, από ${gr(user.soberSince!)}`}</div>
                </div>
              )}
              <div>
                <strong>{doneSessions === 0 ? "Ξεκινάς" : `${doneSessions} ${doneSessions === 1 ? "ατομική" : "ατομικές"}`}</strong>
                <div className="hint">{doneSessions === 0 ? "Η πρώτη σου ατομική έρχεται." : doneSessions === 1 ? "Η πρώτη σου ατομική έγινε. Συνέχισε έτσι." : "με παρουσία, από την αρχή. Συνέχισε έτσι."}</div>
              </div>
              {nextCount > 0 && (
                <div>
                  <strong>{nextCount === 1 ? "1 ατομική" : `${nextCount} ατομικές`}</strong>
                  <div className="hint">επόμενες, κλεισμένες — τις βλέπεις πιο κάτω</div>
                </div>
              )}
            </div>
          </Panel>

          {upcoming.map((b, i) => {
            const minutes = slotMinutes(b.slot.kind, s);
            const joinable = sessionJoinable(b.slot.startsAt, now, s, minutes);
            const canAsk = canRequestChange(b.slot.startsAt, now, s) && !pendingFor.has(b.id);
            const pair = b.slot.kind === "PAIR";
            // Μόνο το επόμενο ραντεβού ξεχωρίζει και δείχνει «Νη ατομική» (τα επόμενα θα έπαιρναν τον ίδιο αριθμό: μετρούν μόνο οι παρουσίες).
            const first = i === 0;
            return (
              <Panel key={b.id} title={pair ? "Το Therapair σου" : "Η ατομική σου"} icon={pair ? "group" : "user"} className={first && hero?.bookingId !== b.id ? "m-next" : undefined}>
                <div className="m-row">
                  <div className="grow">
                    <strong>{formatDate(b.slot.date)} στις {formatTime(b.slot.startsAt)}</strong>
                    <div className="hint">
                      {first && orders.get(b.slot.id) ? `${orders.get(b.slot.id)!.n}η ατομική` : pair ? "Therapair" : "Ατομική"}
                      {!joinable && ` · το κουμπί ανοίγει ${s.sessionJoinBeforeMinutes} λεπτά πριν`}
                    </div>
                    {/* Το δικό του «Μπες» μετρά ως παρουσία (13/10) — το βλέπει και το ίδιο, όπως στην ομάδα. */}
                    {b.joinedAt && <div className="hint">Μπήκες ✓</div>}
                  </div>
                  <form action={`/m/join/${b.id}`} method="post">
                    <button className={first ? "primary" : "outline"} disabled={!joinable}>{pair ? "Μπες στο Therapair σου" : "Μπες στην ατομική σου"}</button>
                  </form>
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  {pendingFor.has(b.id) ? (
                    <Pill tone="grey">αίτημα αλλαγής: σε αναμονή</Pill>
                  ) : canAsk ? (
                    <Link href={`/m/request/${b.id}`}>Αίτημα αλλαγής ή ακύρωσης ›</Link>
                  ) : null}
                </div>
              </Panel>
            );
          })}

          {window.open && (
            <Panel title="Κράτηση ατομικών" icon="calendar" link={{ href: "/m/book", label: "Ραντεβού" }}>
              {/* Ίδιες φράσεις και ίδιος κανόνας με τη σελίδα «Ραντεβού» (21/10): όταν έχει κλείσει όλες τις ώρες, δεν ζητάμε κράτηση. */}
              {left === 0 ? (
                <p className="hint" style={{ margin: 0 }}>Έκλεισες {s.sessionsPerWeek === 1 ? "το ραντεβού" : `και τα ${s.sessionsPerWeek} ραντεβού`} της εβδομάδας.</p>
              ) : (
                <>
                  <p className="hint" style={{ margin: "0 0 10px" }}>Διάλεξε {left === 1 ? (weekBooked === 0 ? "μία ώρα" : "ακόμα μία ώρα") : `${left} ώρες`}. Οι κρατήσεις κλείνουν στις {formatTime(window.closesAt)}.</p>
                  <Link className="btn primary" href="/m/book">Κλείσε ραντεβού</Link>
                </>
              )}
            </Panel>
          )}

          {groupsToday.length > 0 && (
            <Panel title="Ομάδα" icon="group">
              <div className="m-row">
                <div className="grow">
                  <strong>Σήμερα στις {groupsToday.map((g) => g.time).join(", ")}</strong>
                  {attended && <div className="hint">Μπήκες ✓</div>}
                </div>
                <form action="/m/join/group" method="post">
                  <button className="primary" disabled={!groupOpen}>Μπες στην ομάδα</button>
                </form>
              </div>
              {!groupOpen && !attended && <p className="hint" style={{ margin: "6px 0 0" }}>Το κουμπί ανοίγει {s.groupJoinBeforeMinutes} λεπτά πριν.</p>}
              {/* Η παρουσία στην ομάδα καταγράφεται από αυτό το κουμπί (16/10) — το μέλος να το ξέρει. Διατύπωση προς έγκριση. */}
              {!attended && <p className="hint" style={{ margin: "8px 0 0" }}>Μπες πάντα από εδώ, για να ξέρει η ομάδα σου ότι ήρθες.</p>}
            </Panel>
          )}
          {groupsToday.length === 0 && nextGroup && (
            <Panel title="Ομάδα" icon="group">
              <strong>Επόμενη ομάδα: {nextGroup.date === addDays(today.date, 1) ? "αύριο" : formatDate(nextGroup.date)} στις {nextGroup.time}</strong>
            </Panel>
          )}
        </div>

        <div>
          {journalFirst && journalPanel}
          <Link href="/m/journal" className="linkrow panel">
            <span className="iconbox"><Icon name="target" size={20} /></span>
            <span className="grow">
              <span className="hint">Ο στόχος μου αυτή την εβδομάδα</span>
              <div style={{ fontSize: "1.05rem", marginTop: 2 }}>{goal ? `«${goal.text}»` : <span className="muted">Γράψε έναν μικρό στόχο για την εβδομάδα</span>}</div>
              {/* Οι 7 μέρες της εβδομάδας από τα βραδινά τσεκαρίσματα (21/10) — μόνο όταν υπάρχει στόχος, χωρίς ποσοστά. */}
              {goal && <GoalDays days={gw.days} today={today.date} />}
            </span>
            <span className="arrow"><Icon name="chevron" /></span>
          </Link>
          {openTask && taskStatus && (
            <Link href={`/m/library/a/${openTask.id}`} className="linkrow panel">
              <span className="iconbox"><Icon name="doc" size={20} /></span>
              <span className="grow">
                <span className="hint">Η εργασία σου</span>
                <div style={{ fontSize: "1.05rem", marginTop: 2 }}>{openTask.step ? `Βήμα ${openTask.step} · ` : ""}{openTask.title}</div>
                <div style={{ marginTop: 6 }}><Pill tone="grey">{taskStatus.text}</Pill></div>
              </span>
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          )}

          {(s.formsDays.includes(today.weekday) || forms.length > 0) && (
            <Panel title="Φόρμες της θεματικής" icon="list" link={{ href: "/m/texts", label: "Θεματικές" }}>
              {forms.length ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {forms.map((f) => (
                    <li key={f.id}>
                      {/* Φόρμα μέσα στο Apex (22/10): πάντα στη σελίδα της, εκεί απαντά. Παλιές με σύνδεσμο: όπως πριν. */}
                      {f.questions ? (
                        <Link href={`/m/texts/${f.id}`}>{f.title}</Link>
                      ) : f.url && consents.forms === "YES" ? (
                        <a href={withMemberCode(f.url, user.memberCode)} target="_blank" rel="noopener noreferrer">{f.title}</a>
                      ) : (
                        <Link href={`/m/texts/${f.id}`}>{f.title}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint" style={{ margin: 0 }}>Έρχονται στις {s.formsTime}.</p>
              )}
            </Panel>
          )}

          {!journalFirst && journalPanel}
        </div>
      </div>
    </main>
  );
}
