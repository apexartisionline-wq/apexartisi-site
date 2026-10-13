import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { TourFor } from "@/components/TourFor";
import { DayPicker } from "@/components/DayPicker";
import { StaffMessagesLine } from "@/components/StaffMessagesLine";
import { JoinButton } from "@/components/JoinButton";
import { Icon } from "@/components/Icon";
import { enc } from "@/lib/crypto";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AlertBoxes } from "@/components/AlertBoxes";
import { alertBoxes } from "@/lib/assessment-db";
import { dueCycleReviews } from "@/lib/cycle-review";
import { groupDays } from "@/lib/groups";
import { memberSafety } from "@/lib/handover";
import { getSettings } from "@/lib/settings";
import { ensureDemoToday, isDemoSite, startDemoSession } from "@/lib/demo-session";
import { addDays, athensToUtc, formatDate, formatHour, formatTime, localParts, toMinutes } from "@/lib/time";

async function careDone(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  await prisma.careTask.update({
    where: { id: String(formData.get("id")) },
    data: { doneAt: new Date(), doneById: user.id, note: enc(String(formData.get("note") ?? "").slice(0, 500)) },
  });
  redirect("/t");
}

// Μόνο στη δοκιμαστική εγκατάσταση: φτιάχνει μια ατομική «τώρα» με ψεύτικο μέλος, για να δοκιμάσει κανείς τη σύνδεση.
async function demoStart() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  await startDemoSession(user);
  redirect("/t");
}

const CARE = { caring_24h: "Μήνυμα φροντίδας (24 ώρες μετά από κρίση)", caring_7d: "Μήνυμα φροντίδας (7 μέρες μετά από κρίση)", dropout: "Χωρίς επαφή εδώ και μέρες: τηλεφωνεί η διαχείριση", risk_24h: "Αυξημένες ανάγκες ασφάλειας: επαφή μέσα σε 24 ώρες", risk_next_day: "Υψηλές ανάγκες ασφάλειας: επαφή σήμερα" } as Record<string, string>;
const KIND_LABEL: Record<string, string> = { CLINICAL: "ψυχολόγος", BIOMATIC: "βιωματικός θεραπευτής", BOTH: "ψυχολόγος και βιωματικός" };

type Item = {
  key: string;
  startsAt: Date;
  endsAt: Date;
  kind: "Ατομική" | "Therapair" | "Ομάδα";
  icon: "user" | "group";
  title: string;
  href: string;
  memberHref?: string; // φάκελος (μόνο στην ατομική)
  hasNote: boolean;
  memberJoinedAt: Date | null; // πάτησε «Μπες» το μέλος (μόνο ατομική)
  join: { kind: "SLOT" | "GROUP"; ref: string; room: string; label: string };
};

// «Σήμερα»: το κεντρικό σημείο της μέρας του θεραπευτή (ανασχεδιασμός 13/10).
// Αριστερά το πρόγραμμα (με την επόμενη συνεδρία αναδεδειγμένη), δεξιά «Χρειάζεται προσοχή» και «Εκκρεμότητες».
export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const now = new Date();
  const today = localParts(now).date;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const s = await getSettings();
  if (date === today) await ensureDemoToday();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);

  const [boxes, care, slots, week, groups, members, helps] = await Promise.all([
    alertBoxes(user.role),
    prisma.careTask.findMany({ where: { doneAt: null, dueAt: { lte: now }, kind: { notIn: ["dropout", "risk_contact"] } }, orderBy: { dueAt: "asc" } }),
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
    // Κόκκινο κουμπί των τελευταίων 24 ωρών που δεν έχει κλείσει: ποιος το ανέλαβε, αν μίλησαν.
    prisma.helpRequest.findMany({ where: { resolvedAt: null, isDrill: false, createdAt: { gte: dayAgo } }, include: { member: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const myGroups = groups.filter((g) => g.coordinatorId === user.id);
  const names = (x: { bookings: { member: { name: string } }[] }) => x.bookings.map((b) => b.member.name).join(" & ");
  // Μικρό όνομα και αρχικό, για να χωράει στο κινητό (π.χ. «Γιώργος Δ. & Ελένη Δ.»).
  const short = (x: { bookings: { member: { name: string } }[] }) =>
    x.bookings.map((b) => b.member.name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")).join(" & ");
  const isToday = date === today;

  const items: Item[] = [
    ...myGroups.filter((g) => g.date === date).map((g) => {
      const startsAt = athensToUtc(g.date, Math.floor(toMinutes(g.time) / 60), toMinutes(g.time) % 60);
      return {
        key: `g${g.time}`, startsAt, endsAt: new Date(startsAt.getTime() + s.groupDurationMinutes * 60_000),
        kind: "Ομάδα" as const, icon: "group" as const, title: "Εσύ συντονίζεις",
        href: `/t/group/${g.date}/${g.time.replace(":", "")}`, hasNote: g.hasNote, memberJoinedAt: null,
        join: { kind: "GROUP" as const, ref: `${g.date} ${g.time}`, room: s.groupRoomUrl, label: "Μπες στην ομάδα" },
      };
    }),
    ...slots.map((x) => {
      const pair = x.kind === "PAIR";
      return {
        key: x.id, startsAt: x.startsAt, endsAt: new Date(x.startsAt.getTime() + (pair ? s.pairMinutes : s.sessionMinutes) * 60_000),
        kind: (pair ? "Therapair" : "Ατομική") as "Ατομική" | "Therapair", icon: (pair ? "group" : "user") as "user" | "group", title: short(x),
        href: `/t/s/${x.id}`, memberHref: !pair && x.bookings[0] ? `/t/members/${x.bookings[0].member.id}` : undefined,
        hasNote: pair ? x.pairNotes.length > 0 : Boolean(x.note), memberJoinedAt: !pair ? (x.bookings[0]?.joinedAt ?? null) : null,
        join: { kind: "SLOT" as const, ref: x.id, room: s.rooms[x.position - 1] ?? "", label: pair ? "Μπες στο Therapair" : "Μπες στην ατομική" },
      };
    }),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Η επόμενη συνεδρία: η πρώτη που δεν έχει τελειώσει ακόμα (μόνο για σήμερα).
  const nextKey = isToday ? items.find((it) => it.endsAt > now)?.key : undefined;

  // Κατάσταση κάθε ραντεβού, με λέξεις (όχι μόνο χρώμα).
  const statusOf = (it: Item): { text: string; tone: "ok" | "yellow" | "grey" | "accent" } => {
    if (!isToday) {
      if (it.startsAt > now) return { text: "Η σύνδεση είναι διαθέσιμη την ημέρα της συνεδρίας", tone: "grey" };
      return it.hasNote ? { text: "Σημείωμα ✓", tone: "ok" } : { text: "Χωρίς σημείωμα ακόμα", tone: "yellow" };
    }
    const mins = Math.round((it.startsAt.getTime() - now.getTime()) / 60_000);
    if (now < it.startsAt) return mins <= 60 ? { text: `Σε ${mins} λεπτά`, tone: "accent" } : { text: `Στις ${formatTime(it.startsAt)}`, tone: "grey" };
    if (now <= it.endsAt) return { text: "Σε εξέλιξη τώρα", tone: "accent" };
    return it.hasNote ? { text: "Έγινε · σημείωμα ✓", tone: "ok" } : { text: "Έγινε · χωρίς σημείωμα ακόμα", tone: "yellow" };
  };

  // Χρειάζεται προσοχή: κόκκινα σήματα ανά μέλος (ό,τι φαίνεται ήδη στο κουτί των 24 ωρών δεν ξαναβγαίνει).
  const inBox = new Set(boxes.flatMap((b) => b.items.flatMap((a) =>
    a.source === "ASSESSMENT" ? [`${b.id}:assessment_${a.kind}`] : a.source === "JOURNAL" ? [`${b.id}:journal_${a.kind.split(":")[1]}`] : [],
  )));
  const red = (await Promise.all(members.map(async (m) => ({ m, f: (await memberSafety(m.id)).filter((x) => (x.level === "red" || x.key === "risk_review") && !inBox.has(`${m.id}:${x.key}`)) }))))
    .filter((x) => x.f.length > 0)
    .slice(0, 8);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const reviews = await dueCycleReviews(members.map((m) => m.id));
  // Εκκρεμότητες: σημειώματα που δεν γράφτηκαν για συνεδρίες της μέρας που πέρασαν.
  const notesDue = items.filter((it) => it.endsAt <= now && !it.hasNote);
  const attentionCount = boxes.length + helps.length + red.length;
  const todoCount = notesDue.length + reviews.length + care.length;
  const roleLabel = user.role === "ADMIN" ? "διαχείριση" : (KIND_LABEL[user.therapistKind ?? ""] ?? "θεραπευτής");
  // Αν το όνομα έχει ήδη τον ρόλο σε παρένθεση (ψεύτικα στοιχεία), δεν τον ξαναγράφουμε.
  const who = /\(/.test(user.name) ? user.name : `${user.name}, ${roleLabel}`;

  return (
    <main className="wide">
      <Announcements />
      <StaffMessagesLine userId={user.id} />
      <div className="page-head">
        <div>
          <h1>{isToday ? "Σήμερα" : formatDate(date)}</h1>
          <p className="page-sub">{isToday && `${formatDate(date)} · `}{who}</p>
        </div>
        <div className="head-actions">
          <DayPicker date={date} today={today} prev={addDays(date, -1)} next={addDays(date, 1)} prevWeek={addDays(date, -7)} nextWeek={addDays(date, 7)} base="/t" />
        </div>
      </div>
      <details className="small" style={{ margin: "-6px 0 12px" }} data-tour="legend">
        <summary className="muted">Τι σημαίνουν τα χρώματα και οι λέξεις</summary>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          <strong>Κόκκινο</strong> = χρειάζεται ενέργεια σήμερα· <strong>κίτρινο</strong> = να το δεις στην επόμενη επαφή. Το κουτί «24 ώρες» είναι ειδοποίηση: όταν φύγει, δεν σημαίνει ότι λύθηκε το θέμα — τα σήματα μένουν στο «Ασφάλεια» του φακέλου όσο ισχύουν.
          «Το μέλος πάτησε «Μπες»» = πάτησε το κουμπί της εφαρμογής· δεν είναι επιβεβαίωση από το Zoom.
        </p>
      </details>

      <div className="cols cols-60">
        <div className="stackv">
          <section className="panel t-prog" data-tour="program">
            <div className="panel-head">
              <h2>Το πρόγραμμά μου</h2>
              <Link className="small" href="/t/consistency">Συνέπεια μελών ›</Link>
            </div>
            <div className="sched">
              {items.map((it) => {
                const st = statusOf(it);
                const next = it.key === nextKey;
                return (
                  <div key={it.key} className={`sched-item${next ? " next" : ""}`}>
                    <span className="iconbox"><Icon name={it.icon} /></span>
                    <div>
                      {next && <span className="pill" style={{ marginBottom: 4 }}><Icon name="clock" size={14} /> {st.text}</span>}
                      <div className="sched-time">{formatTime(it.startsAt)} – {formatTime(it.endsAt)}</div>
                      <div className="sched-kind">{it.kind} · <Link href={it.href}>{it.title}</Link></div>
                      <div className="sched-status">
                        {!next && <span className={`pill ${st.tone === "accent" ? "" : st.tone}`}>{st.text}</span>}
                        {it.memberJoinedAt && <> · Το μέλος πάτησε «Μπες» {formatTime(it.memberJoinedAt)}</>}
                      </div>
                    </div>
                    <div className="sched-actions">
                      {isToday ? (
                        <JoinButton kind={it.join.kind} refId={it.join.ref} roomUrl={it.join.room} next={it.href} label={it.join.label} />
                      ) : (
                        <Link href={it.href} className="btn">{it.startsAt > now ? "Προετοιμασία" : "Άνοιγμα"}</Link>
                      )}
                      {isToday && <Link href={it.href} className="btn">{it.kind === "Ομάδα" ? "Σημείωμα ομάδας" : "Προετοιμασία"}</Link>}
                      {it.memberHref && <Link href={it.memberHref} className="btn">Φάκελος</Link>}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="empty">Δεν έχεις ομάδα ή ατομική {isToday ? "σήμερα" : "αυτή τη μέρα"}.</div>}
            </div>
            {isToday && items.length > 0 && <p className="hint" style={{ margin: "10px 0 0" }}>Το κουμπί ανοίγει το Zoom σε νέα καρτέλα, καταγράφει την ώρα που το πάτησες και φέρνει εδώ τη σελίδα της συνεδρίας.</p>}
            {isToday && isDemoSite() && (
              <form action={demoStart} className="card" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>Δοκιμαστική ατομική</strong>
                <p className="small muted" style={{ margin: "4px 0 8px" }}>
                  Για να δεις πώς συνδέεσαι και τι βλέπεις μέσα στην ατομική: φτιάχνει μια ατομική τώρα με ψεύτικο μέλος. Θα εμφανιστεί πάνω στο πρόγραμμά σου.
                </p>
                <button type="submit">Ξεκίνα δοκιμαστική ατομική τώρα</button>
              </form>
            )}
          </section>

          <section className="panel t-week" data-tour="week">
            <h2>Τις επόμενες 7 μέρες</h2>
            {[
              ...myGroups.filter((g) => g.date > date).map((g) => ({ key: `${g.date}${g.time}`, sort: `${g.date} ${g.time}`, date: g.date, when: `${formatDate(g.date)} ${g.time}`, sub: "Ομάδα · εσύ συντονίζεις", icon: "group" as const })),
              ...week.map((x) => ({ key: x.id, href: `/t/s/${x.id}`, sort: `${x.date} ${formatHour(x.hour)}`, date: x.date, when: `${formatDate(x.date)} ${formatHour(x.hour)}`, sub: `${x.kind === "PAIR" ? "Therapair" : "Ατομική"} · ${names(x)}`, icon: (x.kind === "PAIR" ? "group" : "user") as "group" | "user" })),
            ]
              .sort((a, b) => a.sort.localeCompare(b.sort))
              .map((r) => (
                <Link key={r.key} className="linkrow" href={"href" in r && r.href ? r.href : `/t?date=${r.date}`}>
                  <span className="iconbox"><Icon name={r.icon} /></span>
                  <span className="grow"><div>{r.when}</div><div className="hint">{r.sub}</div></span>
                  <span className="arrow"><Icon name="chevron" /></span>
                </Link>
              ))}
            {week.length === 0 && myGroups.filter((g) => g.date > date).length === 0 && <div className="empty">Τίποτα προγραμματισμένο τις επόμενες 7 μέρες.</div>}
          </section>
        </div>

        <div className="stackv">
          <section className="panel t-see" data-tour="see">
            <div className="panel-head">
              <h2>Χρειάζεται προσοχή</h2>
              <span className="hint">{attentionCount === 0 ? "τίποτα ανοιχτό" : `${attentionCount} ${attentionCount === 1 ? "θέμα" : "θέματα"}`}</span>
            </div>
            {isToday ? (
              <div data-tour="alerts">
                <AlertBoxes boxes={boxes} />
                {boxes.length > 0 && <p className="hint" style={{ margin: "0 0 10px" }}>Ειδοποίηση 24 ωρών: όταν φύγει από εδώ, το θέμα δεν έχει λυθεί μόνο του· μένει στο «Ασφάλεια» του φακέλου.</p>}
              </div>
            ) : boxes.length > 0 && <p className="hint">Τα σοβαρά σημεία των τελευταίων 24 ωρών φαίνονται στο <Link href="/t">«Σήμερα»</Link>.</p>}
            {helps.map((h) => (
              <div key={h.id} className="attn">
                <span className="iconbox red"><Icon name="alert" size={18} /></span>
                <div className="attn-body">
                  <div className="attn-title">Κόκκινο κουμπί · <Link href={`/t/members/${h.member.id}`}>{h.member.name}</Link></div>
                  <div className="attn-meta">{formatTime(h.createdAt)} · {h.talkedAt ? `Μίλησαν ${formatTime(h.talkedAt)} (${h.claimedByName ?? "—"})` : h.claimedByName ? `Το ανέλαβε: ${h.claimedByName} (${h.claimedAt ? formatTime(h.claimedAt) : ""})` : "Δεν το έχει αναλάβει κανείς ακόμα"}</div>
                </div>
                <div className="attn-actions"><Link className="btn" href={`/t/help/${h.id}`}>{h.claimedByName ? "Άνοιγμα" : "Δες και ανάλαβε"}</Link></div>
              </div>
            ))}
            {red.map(({ m, f }) => (
              <div key={m.id} className={`attn${f[0].level === "red" ? "" : " yellow"}`}>
                <span className={`iconbox ${f[0].level === "red" ? "red" : "yellow"}`}><Icon name={f[0].key === "risk_review" ? "shield" : "alert"} size={18} /></span>
                <div className="attn-body">
                  <div className="attn-title"><Link href={`/t/members/${m.id}`}>{m.name}</Link></div>
                  <ul className="lines small">
                    {f.slice(0, 3).map((x, i) => <li key={i}>{x.href ? <Link href={x.href}>{x.text}</Link> : x.text}{x.at && <span className="muted"> · {formatDate(localParts(x.at).date)}</span>}</li>)}
                    {f.length > 3 && <li className="muted">+{f.length - 3} ακόμα στο «Ασφάλεια» του φακέλου</li>}
                  </ul>
                  <div className="attn-meta">Ανοιχτό σήμα · {f[0].key === "risk_review" ? "επόμενη ενέργεια: αξιολόγηση από ψυχολόγο" : "επόμενη ενέργεια: να το δει όποιος έχει την επόμενη επαφή"}</div>
                </div>
              </div>
            ))}
            {attentionCount === 0 && <div className="empty">Κανένα ανοιχτό θέμα αυτή τη στιγμή.</div>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Εκκρεμότητες</h2>
              <span className="hint">{todoCount === 0 ? "καμία" : todoCount}</span>
            </div>
            {notesDue.map((it) => (
              <Link key={`n${it.key}`} className="todo" href={it.href}>
                <span className="iconbox"><Icon name="doc" /></span>
                <span className="todo-body"><div className="todo-title">Σημείωμα: {it.kind} · {it.title}</div><div className="todo-sub">{formatTime(it.startsAt)} · δεν έχει γραφτεί ακόμα</div></span>
                <span className="arrow"><Icon name="chevron" /></span>
              </Link>
            ))}
            {reviews.map((r) => (
              <Link key={`cr${r.memberId}`} className="todo" href={`/t/members/${r.memberId}/cycle`}>
                <span className="iconbox"><Icon name="refresh" /></span>
                <span className="todo-body"><div className="todo-title">Ανασκόπηση κύκλου · {memberName.get(r.memberId) ?? "Μέλος"}</div><div className="todo-sub">Ολοκλήρωσε τις ατομικές του κύκλου · 2 γραμμές από όποιον είχε την τελευταία ατομική</div></span>
                <span className="arrow"><Icon name="chevron" /></span>
              </Link>
            ))}
            {care.map((c) => (
              <div key={c.id} className="todo">
                <span className="iconbox"><Icon name="chat" /></span>
                <form action={careDone} className="todo-body">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="todo-title"><Link href={`/t/members/${c.memberId}`}>{memberName.get(c.memberId) ?? "Μέλος"}</Link></div>
                  <div className="todo-sub">{CARE[c.kind] ?? c.kind} · από {formatDate(localParts(c.dueAt).date)} · ανοιχτό, όποιος το κάνει το σημειώνει</div>
                  <div className="row" style={{ marginTop: 6, flexWrap: "nowrap" }}>
                    <input name="note" placeholder="σύντομα: τι έγινε" aria-label="Τι έγινε" />
                    <button type="submit">Έγινε</button>
                  </div>
                </form>
              </div>
            ))}
            {todoCount === 0 && <div className="empty">Καμία εκκρεμότητα.</div>}
          </section>
        </div>
      </div>
      <TourFor id="today" userId={user.id} />
    </main>
  );
}
