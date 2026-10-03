import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { GoalWeekCard } from "@/components/GoalWeek";
import { JoinButton } from "@/components/JoinButton";
import { ClearDraft } from "@/components/ClearDraft";
import { NoteFormClient } from "@/components/NoteFormClient";
import { NoteTags } from "@/components/NoteTags";
import { SafetyZone } from "@/components/SafetyZone";
import { latestAssessment } from "@/lib/assessment-db";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RISK_CHANGE, USED_SINCE } from "@/lib/handover-rules";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { sessionNumber } from "@/lib/member";
import { currentRisk } from "@/lib/risk-db";
import { composeNote, type NoteForm, noteFlags, noteFormSchema } from "@/lib/note-form";
import { sessionGlance } from "@/lib/session-glance";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatWhen, localParts } from "@/lib/time";

async function loadSlot(id: string) {
  return prisma.slot.findUnique({
    where: { id },
    include: {
      therapist: { select: { name: true } },
      bookings: { include: { member: { select: { id: true, name: true } } } },
      note: { include: { therapist: { select: { name: true } } } },
    },
  });
}

// Όπου γράφτηκε σημείωμα, η συνεδρία έγινε: το μέλος μετράει «ήρθε» παντού (φάκελος, μήνας, συνέπεια),
// ακόμα κι αν δεν πάτησε το κουμπί «Σύνδεση».
async function markCame(slotId: string, startsAt: Date) {
  if (startsAt > new Date()) return;
  await prisma.booking.updateMany({ where: { slotId, joinedAt: null }, data: { joinedAt: startsAt } });
}

// Όλοι οι θεραπευτές βλέπουν όλες τις συνεδρίες· το σημείωμα το γράφει όποιος
// έχει την ώρα (ή η Εύα), ώστε να μη σβήνει κανείς κατά λάθος σημείωμα άλλου.
const canWrite = (x: { therapistId: string | null }, user: { id: string; role: string }) =>
  user.role === "ADMIN" || x.therapistId === user.id;

const NOTE_MAX = 20000;
const noteSchema = z.object({
  content: z.string().trim().min(1).max(NOTE_MAX),
  riskChange: z.enum(["UP", "SAME", "DOWN"]),
  usedSince: z.enum(["YES", "NO", "UNKNOWN"]),
  nextStep: z.string().trim().max(1000),
});

async function saveNote(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("slotId"));
  const x = await loadSlot(id);
  if (!x || !canWrite(x, user)) notFound();
  // Ο browser ελέγχει ήδη τα πεδία· αν κάτι ξεφύγει, μήνυμα αντί για σφάλμα 500.
  const parsed = noteSchema.safeParse({
    content: formData.get("content") ?? "",
    riskChange: formData.get("riskChange"),
    usedSince: formData.get("usedSince"),
    nextStep: formData.get("nextStep") ?? "",
  });
  if (!parsed.success) redirect(`/t/s/${id}?error=1`);
  const { content, riskChange, usedSince, nextStep } = parsed.data;
  const data = { content: enc(content), riskChange, usedSince, nextStep: enc(nextStep) };
  if (x.note) {
    // Η προηγούμενη μορφή δεν σβήνεται: κρατιέται στο ιστορικό.
    await prisma.$transaction([
      prisma.sessionNoteVersion.create({
        data: { noteId: x.note.id, content: x.note.content, riskChange: x.note.riskChange, usedSince: x.note.usedSince, nextStep: x.note.nextStep, editorId: user.id },
      }),
      prisma.sessionNote.update({ where: { id: x.note.id }, data }),
    ]);
  } else {
    await prisma.sessionNote.create({ data: { slotId: id, therapistId: user.id, ...data } });
  }
  await markCame(id, x.startsAt);
  redirect(`/t/s/${id}?saved=1`);
}

// Σημειωματάριο ατομικής (δομημένο). Το κείμενο («content») γράφεται από τα πεδία,
// ώστε φάκελος, αναζήτηση και ζώνη ασφαλείας να δουλεύουν όπως πριν.
async function saveIndividual(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("slotId"));
  const x = await loadSlot(id);
  if (!x || !canWrite(x, user) || x.kind === "PAIR" || x.bookings.length !== 1) notFound();
  let raw: unknown = null;
  try { raw = JSON.parse(String(formData.get("payload") ?? "")); } catch {}
  const parsed = noteFormSchema.safeParse(raw);
  if (!parsed.success) redirect(`/t/s/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Κάτι λείπει.")}`);
  const d = parsed.data;
  const memberId = x.bookings[0].memberId;
  const flags = noteFlags(d);
  const data = { content: enc(composeNote(d)), data: enc(JSON.stringify(d)), riskChange: flags.riskChange, usedSince: flags.usedSince, nextStep: enc(d.suggested) };
  const ops = [];
  if (x.note) {
    ops.push(prisma.sessionNoteVersion.create({
      data: { noteId: x.note.id, content: x.note.content, riskChange: x.note.riskChange, usedSince: x.note.usedSince, nextStep: x.note.nextStep, data: x.note.data, editorId: user.id },
    }));
    ops.push(prisma.sessionNote.update({ where: { id: x.note.id }, data }));
  } else {
    ops.push(prisma.sessionNote.create({ data: { slotId: id, therapistId: user.id, ...data } }));
  }
  // Υποτροπή: νέα ημερομηνία νηφαλιότητας, με ιστορικό.
  if (!d.sober && d.newSoberSince) {
    const m = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true } });
    if (m.soberSince !== d.newSoberSince) {
      ops.push(prisma.sobrietyChange.create({ data: { memberId, previous: m.soberSince, date: d.newSoberSince, byId: user.id, note: enc(`Σημείωμα ατομικής ${x.date}`) } }));
      ops.push(prisma.user.update({ where: { id: memberId }, data: { soberSince: d.newSoberSince } }));
    }
  }
  await prisma.$transaction(ops);
  // «Δεν ήρθε» στο σημείωμα: δεν μετράει ως παρουσία (το λέει ο θεραπευτής).
  if (d.came) await markCame(id, x.startsAt);
  else await prisma.booking.updateMany({ where: { slotId: id }, data: { joinedAt: null } });
  // «Ενημέρωση ομάδας θεραπευτών τώρα»: ο προβληματισμός φαίνεται 24 ώρες στο «Σήμερα» όλης της ομάδας.
  if (flags.notify) {
    const kind = `CONCERN:${id}`;
    if (!(await prisma.teamAlert.findFirst({ where: { memberId, source: "NOTE", kind } }))) {
      await prisma.teamAlert.create({ data: { memberId, source: "NOTE", kind, byId: user.id } });
    }
  }
  await logAccess(user.id, memberId, "session_note_save");
  redirect(`/t/s/${id}?saved=1`);
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const x = await loadSlot(id);
  if (!x) notFound();
  for (const b of x.bookings) await logAccess(user.id, b.memberId, "session_view");
  const pair = x.kind === "PAIR";
  if (!pair && x.bookings.length === 1) return <IndividualSession x={x} user={user} sp={sp} />;

  // Τι δουλεύτηκε πριν, για κάθε μέλος (οι θεραπευτές αλλάζουν εναλλάξ).
  const members = await Promise.all(
    x.bookings.map(async (b) => ({
      booking: b,
      number: await sessionNumber({ cycleId: b.cycleId, slot: x }),
      previous: await prisma.sessionNote.findMany({
        where: { slot: { startsAt: { lt: x.startsAt }, bookings: { some: { memberId: b.memberId } } } },
        include: { therapist: { select: { name: true } }, slot: { select: { date: true, kind: true } } },
        orderBy: { slot: { startsAt: "desc" } },
        take: 3,
      }),
    })),
  );
  const past = x.startsAt <= new Date();
  const versions = x.note
    ? await prisma.sessionNoteVersion.findMany({ where: { noteId: x.note.id }, orderBy: { createdAt: "desc" } })
    : [];
  const editors = await prisma.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.editorId))] } }, select: { id: true, name: true } });

  return (
    <main>
      <p className="muted">
        {formatDate(x.date)} στις {formatHour(x.hour)} · δωμάτιο {x.position}
        {x.therapist && ` · ${x.therapist.name}`}
      </p>
      <h1>
        {pair && <span className="badge">Therapair</span>}{" "}
        {x.bookings.length === 0 ? "Χωρίς κράτηση" : x.bookings.map((b, i) => (
          <span key={b.id}>
            {i > 0 && " & "}
            <Link href={`/t/members/${b.member.id}`}>{b.member.name}</Link>
          </span>
        ))}
      </h1>

      {members.map(({ booking, number, previous }) => (
        <section key={booking.id}>
          <h2>
            Πριν: {booking.member.name} <span className="muted small">{number && `· ${number}`}</span>
          </h2>
          {previous.length === 0 && <p className="muted">Δεν υπάρχει προηγούμενο σημείωμα.</p>}
          {previous.map((n) => (
            <div className="card" key={n.id}>
              <div className="muted small">
                {formatDate(n.slot.date)} · {n.therapist.name}
                {n.slot.kind === "PAIR" && " · Therapair"}
              </div>
              <div className="body-text">{dec(n.content)}</div>
              <NoteTags riskChange={n.riskChange} usedSince={n.usedSince} nextStep={dec(n.nextStep)} />
            </div>
          ))}
        </section>
      ))}

      <h2>{pair ? "Κοινό σημείωμα" : "Σημείωμα αυτής της συνεδρίας"}</h2>
      {pair && <p className="muted small">Φαίνεται στους φακέλους και των δύο μελών.</p>}
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.error && <div className="error">Το σημείωμα δεν αποθηκεύτηκε: συμπλήρωσε ανάγκες ασφάλειας και χρήση (και το κείμενο έως {NOTE_MAX.toLocaleString("el-GR")} χαρακτήρες).</div>}
      {!canWrite(x, user) ? (
        x.note ? (
          <div className="card">
            <div className="body-text">{dec(x.note.content)}</div>
            <NoteTags riskChange={x.note.riskChange} usedSince={x.note.usedSince} nextStep={dec(x.note.nextStep)} />
          </div>
        ) : <p className="muted">Δεν έχει γραφτεί σημείωμα ακόμα.</p>
      ) : past && x.bookings.length > 0 ? (
        <form action={saveNote} className="card">
          <input type="hidden" name="slotId" value={x.id} />
          <textarea name="content" defaultValue={dec(x.note?.content)} required maxLength={NOTE_MAX} style={{ minHeight: 240 }} />
          <div className="row" style={{ flexWrap: "wrap", gap: 16, marginTop: 12 }}>
            <label className="field">
              Ανάγκες ασφάλειας σε σχέση με πριν
              <select name="riskChange" required defaultValue={x.note?.riskChange ?? ""}>
                <option value="" disabled>—</option>
                {Object.entries(RISK_CHANGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              Χρήση από την προηγούμενη επαφή
              <select name="usedSince" required defaultValue={x.note?.usedSince ?? ""}>
                <option value="" disabled>—</option>
                {Object.entries(USED_SINCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            Επόμενο βήμα
            <input name="nextStep" defaultValue={dec(x.note?.nextStep)} maxLength={1000} placeholder="τι συμφωνήσαμε / τι να δει ο επόμενος" />
          </label>
          <div className="row spread" style={{ marginTop: 12 }}>
            <span className="muted small">
              {x.note && `Τελευταία αλλαγή ${formatWhen(x.note.updatedAt)} · ${x.note.therapist.name}`}
            </span>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
        </form>
      ) : (
        <p className="muted">Το σημείωμα γράφεται μετά τη συνεδρία.</p>
      )}
      {versions.length > 0 && (
        <details className="card small">
          <summary>Ιστορικό αλλαγών ({versions.length})</summary>
          {versions.map((v) => (
            <div key={v.id} style={{ marginTop: 12 }}>
              <div className="muted">
                Πριν από την αλλαγή της {formatWhen(v.createdAt)} · {editors.find((e) => e.id === v.editorId)?.name ?? "—"}
              </div>
              <div className="body-text">{dec(v.content)}</div>
              <NoteTags riskChange={v.riskChange} usedSince={v.usedSince} nextStep={dec(v.nextStep)} />
            </div>
          ))}
        </details>
      )}
    </main>
  );
}

const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("el-GR"));

type Slot = NonNullable<Awaited<ReturnType<typeof loadSlot>>>;

// Ατομική: «με μια ματιά», ημερολόγιο εβδομάδας, εργασία και σημειωματάριο.
async function IndividualSession({ x, user, sp }: { x: Slot; user: { id: string; role: string }; sp: { saved?: string; error?: string; edit?: string } }) {
  const b = x.bookings[0];
  const now = new Date();
  const [g, s, number, joined, intake, versions, assessed, ax] = await Promise.all([
    sessionGlance(b.memberId, x),
    getSettings(),
    sessionNumber({ cycleId: b.cycleId, slot: x }),
    prisma.staffJoin.findFirst({ where: { kind: "SLOT", ref: x.id, userId: user.id }, orderBy: { at: "asc" } }),
    currentRisk(b.memberId),
    x.note ? prisma.sessionNoteVersion.findMany({ where: { noteId: x.note.id }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.intakeCheck.findFirst({ where: { memberId: b.memberId, key: "assessment" }, select: { doneAt: true } }),
    latestAssessment(b.memberId),
  ]);
  const editors = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.editorId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const room = s.rooms[x.position - 1] ?? "";
  const today = localParts(now).date;
  const writable = canWrite(x, user) && now.getTime() >= x.startsAt.getTime() - 15 * 60_000;
  const initial: Partial<NoteForm> | null = x.note?.data ? (JSON.parse(dec(x.note.data)) as NoteForm) : null;
  // Παλιό σημείωμα (πριν από το δομημένο σημειωματάριο): φαίνεται ως κείμενο, δεν ανοίγει άδεια φόρμα από πάνω.
  const showForm = writable && (!x.note || (sp.edit === "1" && Boolean(initial)));
  const risk = intake.level;
  const maxCraving = Math.max(10, ...g.journal.days.map((d) => d?.craving ?? 0));
  const DAY = ["Κ", "Δ", "Τ", "Τ", "Π", "Π", "Σ"];
  const weekday = (d: string) => DAY[new Date(`${d}T12:00:00Z`).getUTCDay()];

  return (
    <main>
      <p className="small"><Link href="/t">‹ Σήμερα</Link></p>
      <h1 style={{ marginBottom: 4 }}><Link href={`/t/members/${b.member.id}`} style={{ color: "inherit", textDecoration: "none" }}>{b.member.name}</Link></h1>
      <p className="muted" style={{ margin: 0 }}>Ατομική · {formatDate(x.date)} {formatHour(x.hour)}{number && ` · ${number}`}{x.therapist && ` · ${x.therapist.name}`}</p>
      <p className="row" style={{ margin: "10px 0 0", gap: 8 }}>
        <Link className="btn" href={`/t/members/${b.member.id}`}>Κλινικός φάκελος ›</Link>
        {!assessed && <Link className="btn primary" href={`/t/members/${b.member.id}/assessment`}>Αρχική αξιολόγηση ›</Link>}
      </p>

      {x.date === today && room && (
        <div className="card row spread" style={{ background: "var(--soft)" }}>
          <span>{joined ? `Μπήκες ${formatHour(localParts(joined.at).hour, localParts(joined.at).minute)} · το Zoom είναι ανοιχτό` : "Δεν έχεις συνδεθεί ακόμα"}</span>
          {joined ? <a className="btn" href={room} target="_blank" rel="noopener noreferrer">Άνοιγμα Zoom</a> : canWrite(x, user) && <JoinButton kind="SLOT" refId={x.id} roomUrl={room} next={`/t/s/${x.id}`} />}
        </div>
      )}

      <div className="split">
      <div className="side">
      <SafetyZone memberId={b.memberId} />
      {ax?.data.summary && (
        <details className="card" open={!x.note}>
          <summary><strong>Σύνοψη από την αρχική αξιολόγηση</strong> <span className="muted small">· {ax.author}</span></summary>
          <div className="body-text" style={{ marginTop: 8 }}>{ax.data.summary}</div>
          <Link className="small" href={`/t/members/${b.memberId}/assessment`}>Όλη η αξιολόγηση ›</Link>
        </details>
      )}

      <h2>Με μια ματιά</h2>
      <div className="tiles">
        <div className="tile"><strong>{g.soberDays ?? "—"}</strong><span>μέρες νηφάλιος/α</span></div>
        <div className="tile"><strong>{g.cycle ? `${g.cycle.done}/${g.cycle.length}` : "—"}</strong><span>ατομικές κύκλου</span></div>
        <div className={`tile${g.groups.total && g.groups.done / g.groups.total < 0.6 ? " warn" : ""}`}><strong>{g.groups.done}/{g.groups.total}</strong><span>ομάδες, 4 εβδ.</span></div>
        <div className="tile"><strong>{g.journal.written}/7</strong><span>απογραφές εβδ.</span></div>
        <div className={`tile${g.help14 ? " warn" : ""}`}><strong>{g.help14}</strong><span>κόκκινο κουμπί, 14 μ.</span></div>
        <div className="tile"><strong style={{ fontSize: "0.95rem", paddingTop: 4, overflowWrap: "anywhere", hyphens: "auto" }}>{intake.trigger ? intake.label : risk ? RISK_LEVELS[risk] : "—"}</strong><span>ανάγκες ασφάλειας</span></div>
      </div>
      <p className="muted small">
        {g.soberSince ? `Νηφάλιος/α από ${formatDate(g.soberSince)}` : "Δεν έχει οριστεί ημερομηνία νηφαλιότητας"}
        {!intake.trigger && risk && ` · ${RISK_INFO[risk].action}`}
      </p>

      <h2>Ανοιχτό από την προηγούμενη φορά</h2>
      <div className="card">
        {g.prev ? (
          <>
            <div>{g.prev.next || <span className="muted">Δεν άφησε κάτι για τον επόμενο.</span>}</div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {g.prev.by} · {formatDate(g.prev.date)} · <Link href={`/t/s/${g.prev.slotId}`}>όλο το σημείωμα</Link> · <Link href={`/t/members/${b.member.id}/notes`}>όλα τα σημειώματα</Link>
            </div>
          </>
        ) : <span className="muted">Πρώτη ατομική: δεν υπάρχει προηγούμενο σημείωμα.</span>}
      </div>

      <h2>Στόχος της εβδομάδας</h2>
      <GoalWeekCard memberId={b.memberId} date={today} />

      <h2>Απογραφές αυτής της εβδομάδας</h2>
      <div className="card">
        {g.journal.written === 0 ? <span className="muted">Δεν έγραψε απογραφές τις τελευταίες 7 μέρες.</span> : (
          <>
            <div className="week" aria-label="Λαχτάρα και ύπνος ανά μέρα">
              <span>Λαχτάρα</span>
              {g.journal.days.map((d, i) => <div className="bar" key={`c${i}`}><i className={d ? (d.craving >= 7 ? "hi" : "") : "none"} style={{ height: d ? `${Math.max(8, (d.craving / maxCraving) * 100)}%` : undefined }} title={d ? `${d.craving}/10` : "χωρίς καταγραφή"} /></div>)}
              <span>Ύπνος</span>
              {g.journal.days.map((d, i) => <div className="bar" key={`s${i}`}><i className={d ? "" : "none"} style={{ height: d ? `${Math.min(100, Math.max(8, (d.sleep / 9) * 100))}%` : undefined }} title={d ? `${d.sleep} ώρες` : "χωρίς καταγραφή"} /></div>)}
              <span />
              {g.journal.days.map((_, i) => { const date = new Date(Date.parse(`${g.journal.fromDate}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10); return <span className="d" key={`d${i}`}>{weekday(date)}</span>; })}
            </div>
            <p className="small" style={{ margin: "10px 0 0" }}>
              Μέσος όρος: λαχτάρα {num(g.journal.craving)}/10 · ύπνος {num(g.journal.sleep)} ώρες · διάθεση {num(g.journal.mood)}/10 · έγραψε {g.journal.written} από 7 μέρες
            </p>
          </>
        )}
      </div>

      {g.assignment && (
        <>
          <h2>Εργασία που γράφει</h2>
          <div className="list">
            <Link href={`/t/members/${b.member.id}`}>
              <span><div className="title">{g.assignment.title}</div><div className="sub">{g.assignment.answered ? "Έχει απαντήσει" : g.assignment.length ? "Σε εξέλιξη" : "Δεν ξεκίνησε"}</div></span>
            </Link>
          </div>
        </>
      )}

      </div>
      <div>
      <h2>Σημειωματάριο</h2>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.saved && <ClearDraft k={`note-draft:${x.id}`} />}
      {sp.error && <div className="error">Δεν αποθηκεύτηκε: {sp.error}</div>}
      {showForm ? (
        <NoteFormClient action={saveIndividual} hidden={{ slotId: x.id }} initial={initial} themeForms={g.forms} />
      ) : x.note ? (
        <div className="card">
          <div className="body-text">{dec(x.note.content)}</div>
          <div className="row spread small" style={{ marginTop: 10 }}>
            <span className="muted">{x.note.therapist.name} · {formatWhen(x.note.updatedAt)}</span>
            {writable && initial ? <Link href={`/t/s/${x.id}?edit=1`}>Αλλαγή</Link> : !initial && <span className="muted">παλιό σημείωμα</span>}
          </div>
        </div>
      ) : (
        <p className="muted">{canWrite(x, user) ? "Το σημειωματάριο ανοίγει 15 λεπτά πριν από τη συνεδρία." : "Δεν έχει γραφτεί σημείωμα ακόμα."}</p>
      )}
      {versions.length > 0 && (
        <details className="card small">
          <summary>Ιστορικό αλλαγών ({versions.length})</summary>
          {versions.map((v) => (
            <div key={v.id} style={{ marginTop: 12 }}>
              <div className="muted">Πριν από την αλλαγή της {formatWhen(v.createdAt)} · {editors.get(v.editorId) ?? "—"}</div>
              <div className="body-text">{dec(v.content)}</div>
            </div>
          ))}
        </details>
      )}
      </div>
      </div>
    </main>
  );
}
