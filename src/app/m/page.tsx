import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { goalWeek } from "@/lib/goals";
import { getPlan, hasPlanContent } from "@/lib/safety";
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
  const [contents, upcoming, journal, attended, requests, consents] = await Promise.all([
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
  ]);

  // Η πορεία του με θετικό πρόσημο (υπεύθυνη 20/10: όχι «Μήνας Χ» ούτε «Χ από 8» στην αρχική — θυμίζουν χρέωση και
  // αντίστροφη μέτρηση και αγχώνουν): μόνο πόσες ατομικές έχει κάνει με παρουσία από την αρχή (ίδιος κανόνας παρουσίας με
  // την ομάδα: η επιβεβαίωση του σημειώματος υπερισχύει, αλλιώς το δικό του «Μπες»). Ο στόχος της εβδομάδας με τα λόγια του.
  // «6η ατομική» στις επόμενες (όχι «6 από 8»)· ίδιος κανόνας αρίθμησης με την ομάδα (session-order.ts).
  const orders = await sessionOrders(upcoming.filter((b) => b.slot.kind === "INDIVIDUAL").map((b) => ({ id: b.slot.id, startsAt: b.slot.startsAt, memberId: user.id })));
  const [doneSessions, gw, nextCount, plan] = await Promise.all([
    prisma.booking.count({ where: { memberId: user.id, slot: { kind: "INDIVIDUAL", startsAt: { lt: now } }, OR: [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }] } }),
    // Ο στόχος της εβδομάδας με τα 7 βραδινά τσεκαρίσματα (goals.ts).
    goalWeek(user.id, today.date),
    // «Επόμενα»: όσα ραντεβού έχει κλεισμένα μπροστά του (όλα, όχι μόνο του τρέχοντος κύκλου), ώστε αριθμός και κάρτες να συμφωνούν.
    prisma.booking.count({ where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.pairMinutes * 60_000) } } } }),
    // «Το πλάνο μου όταν δυσκολεύομαι»: μία ήρεμη γραμμή στο «Σήμερα» όταν υπάρχει (21/10)· όχι κόκκινο, το κόκκινο κουμπί μένει για την κρίση.
    getPlan(user.id),
  ]);
  const goal = gw.goal;
  const hasPlan = Boolean(plan && hasPlanContent(plan));
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
  let hero: NowCard | null = null;
  if (joinNow) {
    const pair = joinNow.slot.kind === "PAIR";
    hero = {
      kind: "session",
      bookingId: joinNow.id,
      title: `${pair ? "Το Therapair σου" : "Η ατομική σου"} ${joinNow.slot.startsAt <= now ? "ξεκίνησε" : "ξεκινά"} στις ${formatTime(joinNow.slot.startsAt)}`,
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
    hero = { kind: "journal", title: "Το ημερολόγιο άνοιξε", hint: "Δυο λεπτά για τη μέρα σου.", action: journalLink };
  } else {
    const later: { at: Date; title: string; hint?: string }[] = [];
    for (const g of groupsToday) {
      const at = athensToUtc(today.date, ...(g.time.split(":").map(Number) as [number, number]));
      if (at > now) later.push({ at, title: `Ομάδα στις ${g.time}`, hint: `Το κουμπί ανοίγει ${s.groupJoinBeforeMinutes} λεπτά πριν.` });
    }
    for (const b of upcoming) if (b.slot.date === today.date && b.slot.startsAt > now) later.push({ at: b.slot.startsAt, title: `${b.slot.kind === "PAIR" ? "Therapair" : "Ατομική"} στις ${formatTime(b.slot.startsAt)}`, hint: `Το κουμπί ανοίγει ${s.sessionJoinBeforeMinutes} λεπτά πριν.` });
    if (consents.journal === "YES" && !journalOpen) later.push({ at: athensToUtc(today.date, ...(s.journalTime.split(":").map(Number) as [number, number])), title: `Ημερολόγιο στις ${s.journalTime}` });
    if (!text && !isAfterLocal(today, s.dailyTextTime)) later.push({ at: athensToUtc(today.date, ...(s.dailyTextTime.split(":").map(Number) as [number, number])), title: `Το κείμενο της ημέρας στις ${s.dailyTextTime}` });
    later.sort((a, b) => a.at.getTime() - b.at.getTime());
    const next = later[0];
    if (next) hero = { kind: "later", title: `Σήμερα: ${next.title}`, hint: [inWords(next.at), next.hint].filter(Boolean).join(" · ") };
    else if (upcoming[0]) hero = { kind: "later", title: `Επόμενο: ${upcoming[0].slot.kind === "PAIR" ? "Therapair" : "ατομική"} ${upcoming[0].slot.date === addDays(today.date, 1) ? "αύριο" : formatDate(upcoming[0].slot.date)} στις ${formatTime(upcoming[0].slot.startsAt)}` };
    else if (window.open) hero = { kind: "book", title: "Κλείσε τα ραντεβού της εβδομάδας", hint: `μέχρι τις ${formatTime(window.closesAt)}`, action: <Link className="btn primary" href="/m/book">Κλείσε ραντεβού</Link> };
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
      <PageHead title={`Γεια σου, ${vocative(user.name.split(" ")[0])}`} sub={formatDate(today.date)} />

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

      {hero && (
        <Panel title="Τώρα" icon="clock" className="m-now">
          <div className="m-row">
            <div className="grow">
              <strong>{hero.title}</strong>
              {hero.hint && <div className="hint">{hero.hint}</div>}
            </div>
            {hero.action}
          </div>
        </Panel>
      )}

      <div className="m-grid">
        <div>
          <Panel title="Η πορεία σου" icon="chart">
            <div className="whereami">
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
            <Panel title="Κράτηση ατομικών" icon="calendar">
              <p className="hint" style={{ margin: "0 0 10px" }}>Κλείσε τα ραντεβού της εβδομάδας μέχρι τις {formatTime(window.closesAt)}.</p>
              <Link className="btn primary" href="/m/book">Κλείσε ραντεβού</Link>
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
          {hasPlan && (
            <Link href="/m/safety" className="linkrow panel">
              <span className="iconbox"><Icon name="shield" size={20} /></span>
              <span className="grow">
                <strong>Δυσκολεύεσαι τώρα;</strong>
                <div className="hint">Το πλάνο σου, με τα δικά σου λόγια</div>
              </span>
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          )}

          <Panel title="Το κείμενο της ημέρας" icon="doc">
            {text ? (
              <>
                {text.imageMime && <Link href={`/m/texts/${text.id}`}><img src={`/api/content/${text.id}/image`} alt={text.title} style={{ width: "100%", borderRadius: 12, marginBottom: 8 }} /></Link>}
                <p style={{ margin: 0 }}><Link href={`/m/texts/${text.id}`}>{text.title} ›</Link></p>
              </>
            ) : (
              <p className="hint" style={{ margin: 0 }}>{isAfterLocal(today, s.dailyTextTime) ? "Δεν υπάρχει κείμενο για σήμερα." : `Έρχεται στις ${s.dailyTextTime}.`}</p>
            )}
          </Panel>

          {(s.formsDays.includes(today.weekday) || forms.length > 0) && (
            <Panel title="Φόρμες της θεματικής" icon="list">
              {forms.length ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {forms.map((f) => (
                    <li key={f.id}>
                      {f.url && consents.forms === "YES" ? (
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
