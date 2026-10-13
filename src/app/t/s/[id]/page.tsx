import Link from "next/link";
import { NoteText } from "@/components/NoteText";
import { TourFor } from "@/components/TourFor";
import { SinceLast } from "@/components/SinceLast";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { GoalWeekCard } from "@/components/GoalWeek";
import { Icon } from "@/components/Icon";
import { goalWeek } from "@/lib/goals";
import { JoinButton } from "@/components/JoinButton";
import { ClearDraft } from "@/components/ClearDraft";
import { NoteFormClient } from "@/components/NoteFormClient";
import { PairNoteClient } from "@/components/PairNoteClient";
import { NoteTags } from "@/components/NoteTags";
import { SafetyZone } from "@/components/SafetyZone";
import { type StaffOption } from "@/components/ActionRow";
import { NoteSummary } from "@/components/NoteSummary";
import { EmptyState, ErrorNote, PageHead, Panel, Pill, PresenceStat } from "@/components/ui";
import { describeSources, PRESENCE_HINT, PRESENCE_LABEL, sessionPresence } from "@/lib/presence";
import { ThemeWeek } from "@/components/ThemeWeek";
import { latestAssessment, latestProfile } from "@/lib/assessment-db";
import { isPsychologist, seesJournalDetail } from "@/lib/access";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RISK_CHANGE, USED_SINCE } from "@/lib/handover-rules";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { sessionNumber } from "@/lib/member";
import { memberNotes } from "@/lib/member-notes";
import { composePairNote, nameVariants, type PairSide, pairFlags, pairSideSchema, scrubSide } from "@/lib/pair-note";
import { historyOf, keepHistory } from "@/lib/history";
import { vocative } from "@/lib/vocative";
import { currentRisk } from "@/lib/risk-db";
import { alertWorthy, composeNote, type NoteForm, noteFlags, noteFormSchema } from "@/lib/note-form";
import { sessionGlance } from "@/lib/session-glance";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatSpan, formatTime, formatWhen, localParts } from "@/lib/time";

async function loadSlot(id: string) {
  return prisma.slot.findUnique({
    where: { id },
    include: {
      therapist: { select: { name: true } },
      bookings: { include: { member: { select: { id: true, name: true } } } },
      note: { include: { therapist: { select: { name: true } } } },
      pairNotes: { include: { therapist: { select: { name: true } } } },
    },
  });
}

// Επιβεβαίωση παρουσίας από το σημείωμα («Ήρθε» / «Δεν ήρθε», απόφαση 13/10): υπερισχύει στον υπολογισμό,
// αλλά ΔΕΝ αγγίζει το πάτημα «Μπες» του μέλους (`joinedAt`), που μένει ως έχει. Κάθε αλλαγή της
// επιβεβαίωσης κρατά την προηγούμενη κατάσταση στο ιστορικό (ποτέ σβήσιμο).
async function confirmPresence(slotId: string, memberId: string, came: boolean, byId: string) {
  const b = await prisma.booking.findFirst({ where: { slotId, memberId }, select: { id: true, joinedAt: true, confirmedCame: true, confirmedAt: true, confirmedById: true } });
  if (!b || b.confirmedCame === came) return;
  await prisma.$transaction([
    keepHistory("presence_confirmed", { memberId, ref: slotId, before: { joinedAt: b.joinedAt, confirmedCame: b.confirmedCame, confirmedAt: b.confirmedAt, confirmedById: b.confirmedById }, byId }),
    prisma.booking.update({ where: { id: b.id }, data: { confirmedCame: came, confirmedAt: new Date(), confirmedById: byId } }),
  ]);
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
  // Παλιό ελεύθερο σημείωμα: γράφτηκε, άρα ο θεραπευτής επιβεβαιώνει ότι ήρθε.
  for (const b of x.bookings) await confirmPresence(id, b.memberId, true, user.id);
  redirect(`/t/s/${id}?saved=1`);
}

// Σημειωματάριο ατομικής (δομημένο). Το κείμενο («content») γράφεται από τα πεδία,
// ώστε φάκελος, αναζήτηση και ζώνη ασφάλειας να δουλεύουν όπως πριν.
// Μία κίτρινη γραμμή 24 ωρών στο «Σήμερα» της ομάδας· όχι δεύτερη αν υπάρχει ήδη ενεργή για το ίδιο σημείωμα.
async function raiseNoteAlert(memberId: string, kind: string, byId: string) {
  const since = new Date(Date.now() - 24 * 3600_000);
  if (await prisma.teamAlert.findFirst({ where: { memberId, source: "NOTE", kind, createdAt: { gte: since } } })) return;
  await prisma.teamAlert.create({ data: { memberId, source: "NOTE", kind, byId } });
}

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
  // «Ήρθε» / «Δεν ήρθε» στο σημείωμα: η επιβεβαίωση του θεραπευτή υπερισχύει του πατήματος «Μπες».
  await confirmPresence(id, memberId, d.came, user.id);
  // «Ενημέρωση ομάδας θεραπευτών τώρα»: ο προβληματισμός φαίνεται 24 ώρες στο «Σήμερα» όλης της ομάδας.
  // Σε διόρθωση, ξανά μόνο αν γράφτηκε κάτι καινούργιο (alertWorthy).
  const prevNote = x.note?.data ? (JSON.parse(dec(x.note.data)) as Partial<NoteForm>) : null;
  if (alertWorthy(x.note ? (prevNote ?? {}) : null, d)) await raiseNoteAlert(memberId, `CONCERN:${id}`, user.id);
  await logAccess(user.id, memberId, "session_note_save");
  redirect(`/t/s/${id}?saved=1`);
}

// Therapair: ένα σημειωματάριο με τα δύο ονόματα → δύο ξεχωριστά σημειώματα, ένα στον φάκελο του καθενός.
// Το όνομα του άλλου δεν μπαίνει ποτέ στο σημείωμα του ενός (γράφεται «το άλλο μέλος»).
async function savePair(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("slotId"));
  const x = await loadSlot(id);
  if (!x || !canWrite(x, user) || x.kind !== "PAIR" || x.bookings.length !== 2) notFound();
  // Αν στο μεταξύ το άλλαξε κάποιος άλλος (ή άλλη συσκευή), δεν το γράφουμε από πάνω χωρίς να το δει.
  const version = String(formData.get("version") ?? "");
  const latest = x.pairNotes.reduce((t, n) => Math.max(t, n.updatedAt.getTime()), 0);
  if (latest && String(latest) !== version) redirect(`/t/s/${id}?error=${encodeURIComponent("Το σημείωμα άλλαξε στο μεταξύ (άλλη συσκευή ή άλλος θεραπευτής). Δες την τελευταία μορφή και ξαναγράψε την αλλαγή σου· το πρόχειρό σου κρατήθηκε.")}&edit=1`);
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(String(formData.get("payload") ?? "{}")); } catch {}
  const sides: { memberId: string; d: PairSide; other: string[] }[] = [];
  for (const b of x.bookings) {
    const parsed = pairSideSchema.safeParse(raw[b.memberId]);
    if (!parsed.success) redirect(`/t/s/${id}?error=${encodeURIComponent(`${b.member.name.split(" ")[0]}: ${parsed.error.issues[0]?.message ?? "κάτι λείπει."}`)}`);
    const otherMember = x.bookings.find((o) => o.memberId !== b.memberId)!.member;
    // Και το όνομα που έχει δηλώσει το άλλο μέλος (π.χ. «Λένα»)· το βλέπει μόνο ο server, όχι ο θεραπευτής.
    const nick = (await latestProfile(otherMember.id))?.data.preferredName;
    const other = nameVariants(otherMember.name, vocative, nick);
    sides.push({ memberId: b.memberId, d: scrubSide(parsed.data, other), other });
  }
  for (const { memberId, d, other } of sides) {
    const flags = pairFlags(d);
    const data = { content: enc(composePairNote(d, other)), data: enc(JSON.stringify(d)), riskChange: flags.riskChange, usedSince: flags.usedSince, nextStep: enc(d.suggested) };
    const old = x.pairNotes.find((n) => n.memberId === memberId);
    const ops = [];
    if (old) {
      ops.push(keepHistory("pair_note", { memberId, ref: id, before: { content: old.content, data: old.data, riskChange: old.riskChange, usedSince: old.usedSince, nextStep: old.nextStep, by: old.therapistId, at: old.updatedAt }, byId: user.id }));
      ops.push(prisma.pairNote.update({ where: { id: old.id }, data }));
    } else {
      ops.push(prisma.pairNote.create({ data: { slotId: id, memberId, therapistId: user.id, ...data } }));
    }
    if (!d.sober && d.newSoberSince) {
      const m = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true } });
      if (m.soberSince !== d.newSoberSince) {
        ops.push(prisma.sobrietyChange.create({ data: { memberId, previous: m.soberSince, date: d.newSoberSince, byId: user.id, note: enc(`Therapair ${x.date}`) } }));
        ops.push(prisma.user.update({ where: { id: memberId }, data: { soberSince: d.newSoberSince } }));
      }
    }
    await prisma.$transaction(ops);
    // Παρουσία ανά μέλος: η επιβεβαίωση («Ήρθε» / «Δεν ήρθε») υπερισχύει του πατήματος «Μπες».
    await confirmPresence(id, memberId, d.came, user.id);
    const prevSide = old?.data ? (JSON.parse(dec(old.data)) as Partial<PairSide>) : null;
    if (alertWorthy(old ? (prevSide ?? {}) : null, d)) await raiseNoteAlert(memberId, `PAIR:${id}`, user.id);
    await logAccess(user.id, memberId, "session_note_save");
  }
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
  const s = await getSettings();
  if (!pair && x.bookings.length === 1) return <IndividualSession x={x} user={user} sp={sp} />;
  if (pair && x.bookings.length === 2) return <PairSession x={x} user={user} sp={sp} />;

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
        {formatDate(x.date)} {formatSpan(x.startsAt, x.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes)} · δωμάτιο {x.position}
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
            Προηγούμενα σημειώματα — {booking.member.name} <span className="muted small">{number && `· ${number}`}</span>
          </h2>
          {previous.length === 0 && <p className="muted">Πρώτη ατομική: δεν υπάρχει προηγούμενο σημείωμα.</p>}
          {previous.map((n) => (
            <div className="card" key={n.id}>
              <div className="muted small">
                {formatDate(n.slot.date)} · {n.therapist.name}
                {n.slot.kind === "PAIR" && " · Therapair"}
              </div>
              <NoteText text={dec(n.content)} />
              <NoteTags riskChange={n.riskChange} usedSince={n.usedSince} nextStep={dec(n.nextStep)} text={dec(n.content)} />
            </div>
          ))}
        </section>
      ))}

      <h2>{pair ? "Κοινό σημείωμα" : "Σημείωμα αυτής της ατομικής"}</h2>
      {pair && <p className="muted small">Φαίνεται στους φακέλους και των δύο μελών.</p>}
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.error && <div className="error">Δεν αποθηκεύτηκε: λείπουν «Ανάγκες ασφάλειας» ή «Χρήση», ή το κείμενο ξεπερνά τους {NOTE_MAX.toLocaleString("el-GR")} χαρακτήρες.</div>}
      {!canWrite(x, user) ? (
        x.note ? (
          <div className="card">
            <NoteText text={dec(x.note.content)} />
            <NoteTags riskChange={x.note.riskChange} usedSince={x.note.usedSince} nextStep={dec(x.note.nextStep)} text={dec(x.note.content)} />
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
            Τι προτείναμε
            <input name="nextStep" defaultValue={dec(x.note?.nextStep)} maxLength={1000} placeholder="τι συμφωνήσαμε / τι να δει η επόμενη ατομική" />
          </label>
          <div className="row spread" style={{ marginTop: 12 }}>
            <span className="muted small">
              {x.note && `Τελευταία αλλαγή ${formatWhen(x.note.updatedAt)} · ${x.note.therapist.name}`}
            </span>
            <button className="primary" type="submit">Αποθήκευση</button>
          </div>
        </form>
      ) : (
        <p className="muted">Το σημείωμα γράφεται μετά την ατομική.</p>
      )}
      {versions.length > 0 && (
        <details className="card small">
          <summary>Ιστορικό αλλαγών ({versions.length}) — μόνο για ανάγνωση</summary>
          {versions.map((v) => (
            <div key={v.id} style={{ marginTop: 12 }}>
              <div className="muted">
                Πριν από την αλλαγή της {formatWhen(v.createdAt)} · {editors.find((e) => e.id === v.editorId)?.name ?? "—"}
              </div>
              <NoteText text={dec(v.content)} />
              <NoteTags riskChange={v.riskChange} usedSince={v.usedSince} nextStep={dec(v.nextStep)} text={dec(v.content)} />
            </div>
          ))}
        </details>
      )}
    </main>
  );
}

const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("el-GR"));

type Slot = NonNullable<Awaited<ReturnType<typeof loadSlot>>>;

// Ατομική (13/10): ενιαίος χώρος προετοιμασίας, σύνδεσης και καταγραφής — αριστερά το πλαίσιο του μέλους (σύντομο,
// με ανάπτυξη για περισσότερα), δεξιά το σημειωματάριο σε καρτέλες.
async function IndividualSession({ x, user, sp }: { x: Slot; user: { id: string; role: string }; sp: { saved?: string; error?: string; edit?: string } }) {
  const b = x.bookings[0];
  const now = new Date();
  const today = localParts(now).date;
  const [g, s, number, joined, intake, versions, assessed, ax, goal] = await Promise.all([
    sessionGlance(b.memberId, x),
    getSettings(),
    sessionNumber({ cycleId: b.cycleId, slot: x }),
    prisma.staffJoin.findFirst({ where: { kind: "SLOT", ref: x.id, userId: user.id }, orderBy: { at: "asc" } }),
    currentRisk(b.memberId),
    x.note ? prisma.sessionNoteVersion.findMany({ where: { noteId: x.note.id }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.intakeCheck.findFirst({ where: { memberId: b.memberId, key: "assessment" }, select: { doneAt: true } }),
    latestAssessment(b.memberId),
    goalWeek(b.memberId, today),
  ]);
  const editors = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.editorId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const room = s.rooms[x.position - 1] ?? "";
  // Ο ισχύων κανόνας: το σημειωματάριο ανοίγει 15 λεπτά πριν από την ώρα της, για όποιον έχει την ώρα (ή τη διαχείριση).
  const writable = canWrite(x, user) && now.getTime() >= x.startsAt.getTime() - 15 * 60_000;
  const initial: Partial<NoteForm> | null = x.note?.data ? (JSON.parse(dec(x.note.data)) as NoteForm) : null;
  // Παλιό σημείωμα (πριν από το δομημένο σημειωματάριο): φαίνεται ως κείμενο, δεν ανοίγει άδεια φόρμα από πάνω.
  const showForm = writable && (!x.note || (sp.edit === "1" && Boolean(initial)));
  const risk = intake.level;
  const hm = (d: Date) => formatHour(localParts(d).hour, localParts(d).minute);
  const n = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));
  const h = g.prev?.handover;
  const hasHandover = Boolean(h && (h.agreed || h.openIssues || h.handover));

  const endsAt = new Date(x.startsAt.getTime() + s.sessionMinutes * 60_000);
  const presence = sessionPresence({ startsAt: x.startsAt, endsAt, now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame });
  const pl = PRESENCE_LABEL[presence];
  const viewer = { id: user.id, role: user.role, therapistKind: (user as { therapistKind?: string | null }).therapistKind ?? null };
  const staff: StaffOption[] = user.role === "ADMIN"
    ? (await prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true, name: true, therapistKind: true, role: true }, orderBy: { name: "asc" } })).map((u) => ({ id: u.id, name: u.name, clinician: u.role === "ADMIN" || u.therapistKind === "CLINICAL" || u.therapistKind === "BOTH", admin: u.role === "ADMIN" }))
    : [];

  return (
    <main className="wide">
      <PageHead
        crumbs={[{ href: "/t", label: "Σήμερα" }, { label: "Ατομική" }]}
        title={<Link href={`/t/members/${b.member.id}`} style={{ color: "inherit", textDecoration: "none" }}>{b.member.name}</Link>}
        sub={<>Ατομική · {formatDate(x.date)} {formatSpan(x.startsAt, s.sessionMinutes)}{number && ` · ${number}`}{x.therapist && ` · ${x.therapist.name}`}</>}
      >
        <Link className="btn outline" href={`/t/members/${b.member.id}`}><Icon name="folder" size={18} /> Κλινικός φάκελος</Link>
        {!assessed && isPsychologist(viewer) && <Link className="btn outline" href={`/t/members/${b.member.id}/assessment`}>Αρχική αξιολόγηση ›</Link>}
        {x.date === today && room && canWrite(x, user) && (
          joined
            ? <a className="btn primary" href={room} target="_blank" rel="noopener noreferrer"><Icon name="video" size={18} /> Άνοιγμα Zoom</a>
            : <JoinButton kind="SLOT" refId={x.id} roomUrl={room} next={`/t/s/${x.id}`} label="Μπες στην ατομική" icon="video" />
        )}
        <span className="conn" title="Είναι η ώρα του πατήματος του κουμπιού «Μπες», όχι επιβεβαίωση συμμετοχής από το Zoom.">
          <i className={joined ? "on" : ""} />
          {joined ? `Συνδέθηκες στις ${hm(joined.at)}` : x.date === today ? "Δεν έχεις πατήσει «Μπες»" : "Καμία σύνδεση"}
          {b.joinedAt && <> · το μέλος πάτησε «Μπες» {hm(b.joinedAt)}</>}
        </span>
      </PageHead>
      <p className="hint" style={{ margin: "-10px 0 16px" }}>
        <Pill tone={pl.tone === "accent" ? "" : pl.tone}>{pl.word}</Pill> <span title={pl.source}>{pl.source}</span>{presence === "absent_confirmed" && b.joinedAt && <> · το πάτημα «Μπες» του μέλους ({hm(b.joinedAt)}) διατηρείται στο ιστορικό</>}
      </p>

      <div className="cols cols-38">
        <div className="stackv side">
          <div data-tour="safety"><SafetyZone memberId={b.memberId} viewer={viewer} staff={staff} back={`/t/s/${x.id}`} /></div>

          <Panel title="Με μια ματιά" tour="glance">
            {x.date < today && <p className="hint" style={{ margin: "-6px 0 8px" }}>όπως είναι σήμερα, όχι τότε</p>}
            <div className="stats">
              <div className="stat"><b>{g.soberDays ?? "—"}</b><span>μέρες νηφαλιότητας{g.soberSince ? ` · από ${formatDate(g.soberSince)}` : ""}</span></div>
              <div className="stat"><b>{g.journal.written}/7</b><span>απογραφές · 7 ημέρες</span></div>
              {g.cycle ? (
                <>
                  <PresenceStat what={`ομάδες του μήνα (από ${s.groupsPerCycle})`} counted={g.cycle.groups} passed={g.cycle.groupsPassed} noRecord={g.cycle.groupsNoRecord} />
                  <PresenceStat what={`ατομικές του μήνα (από ${g.cycle.length})`} counted={g.cycle.attended} passed={g.cycle.done} noRecord={g.cycle.presence.noRecord} />
                </>
              ) : (
                <div className="stat"><b>—</b><span>δεν έχει ξεκινήσει κύκλος</span></div>
              )}
            </div>
            <p className="hint" style={{ margin: "10px 0 0" }}>{PRESENCE_HINT}</p>
            {g.cycle && <p className="hint" style={{ margin: "4px 0 0" }}>{g.cycle.periodLabel} · {g.cycle.booked} από {g.cycle.length} ατομικές προγραμματισμένες{describeSources(g.cycle.presence) && ` · πηγή: ${describeSources(g.cycle.presence)}`}{g.cycle.presence.confirmedAbsent > 0 && ` · ${g.cycle.presence.confirmedAbsent} «Δεν ήρθε» (επιβεβαίωση)`}</p>}
            <p className="hint" style={{ margin: "6px 0 0" }}>
              Ανάγκες ασφάλειας: <strong>{intake.trigger ? intake.label : risk ? RISK_LEVELS[risk] : "δεν έχει χρειαστεί"}</strong>{!intake.trigger && risk && ` · ${RISK_INFO[risk].action}`}
              {g.help14 > 0 && <> · κόκκινο κουμπί {g.help14} {g.help14 === 1 ? "φορά" : "φορές"} σε 14 ημέρες</>}
            </p>
          </Panel>

          <Panel title="Ανοιχτό από την προηγούμενη φορά" id="open" tour="open">
            {g.prev ? (
              <>
                {hasHandover ? (
                  <div className="stack wm">
                    {h!.agreed && <div><span className="muted small">Συμφωνήθηκε ως επόμενο βήμα</span><div>{h!.agreed}</div></div>}
                    {h!.openIssues && <div><span className="muted small">Έμεινε ανοιχτό</span><div>{h!.openIssues}</div></div>}
                    {h!.handover && <div><span className="muted small">Για τον επόμενο θεραπευτή</span><div>{h!.handover}</div></div>}
                    {h!.suggested && <div><span className="muted small">Τι προτείναμε</span><div>{h!.suggested}</div></div>}
                  </div>
                ) : (
                  <div>{g.prev.next ? <><span className="muted small">Τι προτείναμε</span><div>{g.prev.next}</div></> : <span className="muted">Δεν άφησε κάτι για την επόμενη ατομική.</span>}</div>
                )}
                <NoteSummary author={`${g.prev.by}${g.prev.pair ? " · Therapair" : ""}`} at={g.prev.date} text={g.prev.text} href={`/t/s/${g.prev.slotId}`} label="Δες το σημείωμα" />
              </>
            ) : <EmptyState>Πρώτη ατομική: δεν υπάρχει προηγούμενο σημείωμα.</EmptyState>}
          </Panel>

          {g.prev && (
            <Panel title="Από την προηγούμενη ατομική" tour="since">
              <div className="kv"><span>Λαχτάρα</span><strong>{g.journal.written > 0 ? `${n(g.journal.craving)} / 10` : "—"}</strong></div>
              <div className="kv"><span>Ύπνος</span><strong>{g.journal.written > 0 ? `${n(g.journal.sleep)} ώρες` : "—"}</strong></div>
              <div className="kv"><span>Απογραφές</span><strong>{g.journal.written} από 7 ημέρες</strong></div>
              <details className="fold" style={{ marginTop: 8 }}>
                <summary>Αναλυτική εικόνα (ομάδες, απογραφές, κόκκινο κουμπί)</summary>
                <div style={{ marginTop: 8 }}>
                  <SinceLast journalDetail={seesJournalDetail(viewer)} memberId={b.memberId} prev={g.prev} until={x.date < today ? x.date : today} untilAt={x.startsAt < now ? x.startsAt : now} compact />
                </div>
              </details>
            </Panel>
          )}

          <Panel title="Στόχος και εργασία" tour="goal">
            <GoalWeekCard memberId={b.memberId} date={today} />
            {g.assignment ? (
              <Link className="linkrow" href={`/t/members/${b.member.id}/assignments`}>
                <span className="iconbox"><Icon name="doc" /></span>
                <span className="grow"><div>{g.assignment.title}</div><div className="hint">{g.assignment.answered ? "Έχει απαντήσει" : g.assignment.length ? "Σε εξέλιξη" : "Δεν ξεκίνησε"}</div></span>
                <span className="arrow"><Icon name="chevron" /></span>
              </Link>
            ) : <p className="hint" style={{ margin: "8px 0 0" }}>Δεν έχει σταλεί εργασία.</p>}
          </Panel>

          <Panel>
            <ThemeWeek forms={g.theme.forms} dailyText={g.theme.dailyText} compact />
          </Panel>

          {ax?.data.summary && isPsychologist(viewer) && (
            <details className="panel fold">
              <summary>Σύνοψη από την αρχική αξιολόγηση <span className="muted small">· {ax.author}</span></summary>
              <div className="body-text" style={{ marginTop: 8 }}>{ax.data.summary}</div>
              <Link className="small" href={`/t/members/${b.memberId}/assessment`}>Όλη η αξιολόγηση ›</Link>
            </details>
          )}
        </div>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 data-tour="notebook" style={{ margin: 0 }}>Σημειωματάριο</h2>
              <div className="hint">Καταγραφή ατομικής</div>
            </div>
            {writable && x.note && !showForm && initial && <Link className="btn primary" data-tour="edit-note" href={`/t/s/${x.id}?edit=1`}>Άλλαξε το σημείωμα</Link>}
          </div>
          {sp.saved && <div className="notice">Αποθηκεύτηκε ✓ {x.note && <span className="muted small">· {x.note.therapist.name}, {formatWhen(x.note.updatedAt)}</span>}</div>}
          {sp.saved && <ClearDraft k={`note-draft:${x.id}`} />}
          {sp.error && <ErrorNote>Δεν αποθηκεύτηκε: {sp.error} Το κείμενό σου κρατήθηκε ως πρόχειρο σε αυτή την καρτέλα.</ErrorNote>}
          {showForm ? (
            <NoteFormClient
              action={saveIndividual}
              hidden={{ slotId: x.id }}
              initial={initial}
              themeForms={g.forms}
              themeDetails={g.themeDetails}
              cameDefault={Boolean(b.joinedAt)}
              savedAt={x.note ? formatWhen(x.note.updatedAt) : undefined}
              context={{ goal: goal.goal?.text ?? null, assignment: g.assignment?.title ?? null }}
            />
          ) : x.note ? (
            <div>
              <NoteText text={dec(x.note.content)} />
              <div className="row spread small" style={{ marginTop: 10 }}>
                <span className="muted">{x.note.therapist.name} · {formatWhen(x.note.updatedAt)}</span>
                {writable && initial ? <Link href={`/t/s/${x.id}?edit=1`}>Αλλαγή</Link> : !initial && <span className="muted">παλιό σημείωμα</span>}
              </div>
            </div>
          ) : (
            <EmptyState>{canWrite(x, user) ? `Το σημειωματάριο ανοίγει 15 λεπτά πριν από την ώρα της ατομικής (${formatTime(new Date(x.startsAt.getTime() - 15 * 60_000))}).` : "Δεν έχει γραφτεί σημείωμα ακόμα."}</EmptyState>
          )}
          {versions.length > 0 && (
            <details className="fold small" style={{ marginTop: 14 }}>
              <summary>Ιστορικό αλλαγών ({versions.length}) — μόνο για ανάγνωση</summary>
              {versions.map((v) => (
                <div key={v.id} style={{ marginTop: 12 }}>
                  <div className="muted">Πριν από την αλλαγή της {formatWhen(v.createdAt)} · {editors.get(v.editorId) ?? "—"}</div>
                  <NoteText text={dec(v.content)} />
                </div>
              ))}
            </details>
          )}
        </section>
      </div>
      <TourFor id="session" userId={user.id} />
    </main>
  );
}

// Therapair: το ζευγάρι, η ασφάλεια και το «ανοιχτό» του καθενός, και το σημειωματάριο με τα δύο ονόματα.
async function PairSession({ x, user, sp }: { x: Slot; user: { id: string; role: string }; sp: { saved?: string; error?: string; edit?: string } }) {
  const now = new Date();
  const s = await getSettings();
  const room = s.rooms[x.position - 1] ?? "";
  const today = localParts(now).date;
  const members = [...x.bookings].sort((p, q) => p.member.name.localeCompare(q.member.name, "el")).map((b) => b.member) as [{ id: string; name: string }, { id: string; name: string }];
  const [joined, { forms, theme, themeDetails }, perMember] = await Promise.all([
    prisma.staffJoin.findFirst({ where: { kind: "SLOT", ref: x.id, userId: user.id }, orderBy: { at: "asc" } }),
    sessionGlance(members[0].id, x).then((g) => ({ forms: g.forms, theme: g.theme, themeDetails: g.themeDetails })),
    Promise.all(members.map(async (m) => ({
      m,
      prev: (await memberNotes(m.id, { before: x.startsAt, excludeSlot: x.id, take: 1 }))[0] ?? null,
      history: await historyOf("pair_note", { memberId: m.id, ref: x.id }),
    }))),
  ]);
  const writable = canWrite(x, user) && now.getTime() >= x.startsAt.getTime() - 15 * 60_000;
  const initial: Record<string, Partial<PairSide>> = {};
  for (const n of x.pairNotes) if (n.data) initial[n.memberId] = JSON.parse(dec(n.data)) as PairSide;
  const showForm = writable && (x.pairNotes.length === 0 || sp.edit === "1");
  const first = (n: string) => n.split(" ")[0];

  const viewer = { id: user.id, role: user.role, therapistKind: (user as { therapistKind?: string | null }).therapistKind ?? null };
  return (
    <main className="wide">
      <PageHead
        crumbs={[{ href: "/t", label: "Σήμερα" }, { label: "Therapair" }]}
        title={<><Pill>Therapair</Pill> {members.map((m, i) => <span key={m.id}>{i > 0 && " & "}<Link href={`/t/members/${m.id}`} style={{ color: "inherit", textDecoration: "none" }}>{m.name}</Link></span>)}</>}
        sub={<>{formatDate(x.date)} {formatSpan(x.startsAt, s.pairMinutes)}{x.therapist && ` · ${x.therapist.name}`}</>}
      >
        {writable && !showForm && <Link className="btn primary" data-tour="edit-note" href={`/t/s/${x.id}?edit=1`}>Άλλαξε το σημείωμα</Link>}
        {showForm && <a className="btn outline" href="#notebook">Πήγαινε στο σημειωματάριο ↓</a>}
        {x.date === today && room && (joined
          ? <a className="btn primary" href={room} target="_blank" rel="noopener noreferrer"><Icon name="video" size={18} /> Άνοιγμα Zoom</a>
          : canWrite(x, user) && <JoinButton kind="SLOT" refId={x.id} roomUrl={room} next={`/t/s/${x.id}`} label="Μπες στο Therapair" icon="video" />)}
        {x.date === today && room && (
          <span className="conn" title="Είναι η ώρα του πατήματος του κουμπιού «Μπες», όχι επιβεβαίωση συμμετοχής από το Zoom.">
            <i className={joined ? "on" : ""} />{joined ? `Συνδέθηκες στις ${formatHour(localParts(joined.at).hour, localParts(joined.at).minute)}` : "Δεν έχεις πατήσει «Μπες»"}
          </span>
        )}
      </PageHead>

      <ThemeWeek forms={theme.forms} dailyText={theme.dailyText} compact />

      <div className="pair-grid" style={{ marginTop: 12 }} data-tour="pair-members">
        {perMember.map(({ m, prev }) => (
          <section key={m.id} className="pair-col">
            <h2 style={{ marginTop: 0 }}>{m.name}</h2>
            <SafetyZone memberId={m.id} viewer={viewer} back={`/t/s/${x.id}`} />
            <div className="panel small">
              <strong>Ανοιχτό από την προηγούμενη φορά</strong>
              <div style={{ marginTop: 4 }}>{prev ? (prev.next || <span className="muted">Δεν άφησε κάτι για την επόμενη ατομική.</span>) : <span className="muted">Πρώτη ατομική: δεν υπάρχει προηγούμενο σημείωμα.</span>}</div>
              {prev && <div className="muted" style={{ marginTop: 4 }}>{prev.therapist} · {formatDate(prev.date)} · <Link href={`/t/members/${m.id}/notes`}>όλα τα σημειώματα</Link></div>}
            </div>
            {prev && (
              <div className="small">
                <strong>Από την προηγούμενη ατομική ως σήμερα</strong>
                <SinceLast journalDetail={seesJournalDetail(viewer)} memberId={m.id} prev={{ date: prev.date, by: prev.therapist, text: prev.text, slotId: prev.slotId, pair: prev.pair }} until={x.date < today ? x.date : today} untilAt={x.startsAt < now ? x.startsAt : now} />
              </div>
            )}
            <GoalWeekCard memberId={m.id} date={today} />
          </section>
        ))}
      </div>

      <h2 data-tour="notebook" style={{ marginTop: 24 }}>Σημειωματάριο Therapair</h2>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓ — ένα σημείωμα στον φάκελο του καθενός.</div>}
      {sp.saved && <ClearDraft k={`pair-draft:${x.id}`} />}
      {sp.error && <ErrorNote>Δεν αποθηκεύτηκε: {sp.error}</ErrorNote>}
      {showForm && sp.error && x.pairNotes.length > 0 && (
        <details className="panel small" open>
          <summary>Η τελευταία αποθηκευμένη μορφή</summary>
          {members.map((m) => {
            const n = x.pairNotes.find((p) => p.memberId === m.id);
            return n ? <div key={m.id} style={{ marginTop: 8 }}><div className="pair-name">{first(m.name)} · {n.therapist.name}, {formatWhen(n.updatedAt)}</div><NoteText text={dec(n.content)} /></div> : null;
          })}
        </details>
      )}
      {showForm ? (
        <PairNoteClient action={savePair} slotId={x.id} members={members} initial={initial} themeForms={forms} themeDetails={themeDetails} cameDefault={Object.fromEntries(x.bookings.map((bk) => [bk.memberId, Boolean(bk.joinedAt)]))} savedAt={x.pairNotes.length ? formatWhen(new Date(x.pairNotes.reduce((t, n) => Math.max(t, n.updatedAt.getTime()), 0))) : undefined} version={String(x.pairNotes.reduce((t, n) => Math.max(t, n.updatedAt.getTime()), 0) || "")} />
      ) : x.pairNotes.length > 0 ? (
        <>
          <div className="pair-grid">
            {members.map((m) => {
              const n = x.pairNotes.find((p) => p.memberId === m.id);
              return (
                <div key={m.id} className="panel pair-col">
                  <div className="pair-name">Στον φάκελο: {first(m.name)}</div>
                  {n ? <NoteText text={dec(n.content)} /> : <span className="muted">Δεν γράφτηκε.</span>}
                  {n && <div className="muted small" style={{ marginTop: 8 }}>{n.therapist.name} · {formatWhen(n.updatedAt)}</div>}
                </div>
              );
            })}
          </div>
          {writable && <p><Link className="btn" href={`/t/s/${x.id}?edit=1`}>Αλλαγή</Link></p>}
        </>
      ) : x.note ? (
        <div className="card">
          <div className="muted small">Παλιό κοινό σημείωμα (πριν από το σημειωματάριο Therapair)</div>
          <NoteText text={dec(x.note.content)} />
        </div>
      ) : (
        <p className="muted">{canWrite(x, user) ? "Το σημειωματάριο ανοίγει 15 λεπτά πριν από την ώρα της." : "Δεν έχει γραφτεί σημείωμα ακόμα."}</p>
      )}
      {perMember.some((p) => p.history.length > 0) && (
        <details className="card small">
          <summary>Ιστορικό αλλαγών (μόνο για ανάγνωση — δεν σβήνει τίποτα)</summary>
          {perMember.flatMap(({ m, history }) => history.map((h, i) => (
            <div key={`${m.id}${i}`} style={{ marginTop: 12 }}>
              <div className="muted">{first(m.name)} · πριν από την αλλαγή της {formatWhen(h.at)} · {h.by}</div>
              <NoteText text={dec((h.before as { content: string }).content)} />
            </div>
          )))}
        </details>
      )}
      <TourFor id="pair" userId={user.id} />
    </main>
  );
}
