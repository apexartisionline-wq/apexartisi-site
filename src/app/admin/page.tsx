import { StaffMessagesLine } from "@/components/StaffMessagesLine";
import { memberIntake } from "@/lib/intake";
import Link from "next/link";
import { AlertBoxes } from "@/components/AlertBoxes";
import { alertBoxes } from "@/lib/assessment-db";
import { redirect } from "next/navigation";
import { latestProfile } from "@/lib/assessment-db";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatHour, formatTime, localParts } from "@/lib/time";
import { claimAction } from "@/app/t/actions";
import { fresh } from "@/lib/fresh-url";
import { expiringSoon, runRetentionDaily } from "@/lib/retention-db";
import { nextSession, riskTriggerDue } from "@/lib/risk-db";
import { kindWord } from "@/lib/access";
import { autoCloseCycles } from "@/lib/cycle-review";
import { mottoFor } from "@/lib/mottos";
import { pendingNotesAll } from "@/lib/note-gate";
import { vocative } from "@/lib/vocative";

// Νέος κύκλος μετά το αυτόματο κλείσιμο (17/10): η διαχείριση ενημερώνει το μέλος, συμφωνητικό και προεξόφληση — και το σημειώνει.
async function newCycleDone(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const old = await prisma.careTask.findUniqueOrThrow({ where: { id } });
  if (old.kind !== "new_cycle" || old.doneAt) redirect(fresh("/admin"));
  const now = new Date();
  await prisma.careTask.update({ where: { id }, data: { doneAt: now, doneById: admin.id, note: enc(note), ...(old.claimedAt ? {} : { claimedById: admin.id, claimedByName: admin.name, claimedAt: now }) } });
  await logAccess(admin.id, old.memberId, "new_cycle_done");
  redirect(fresh("/admin"));
}

async function settle(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.cycle.update({ where: { id: String(formData.get("id")) }, data: { settledAt: new Date() } });
  redirect("/admin");
}

// Απώλεια επαφής: τηλεφωνεί η διαχείριση και γράφει σύντομα τι έγινε (μένει με όνομα και ώρα).
async function dropoutDone(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!note) redirect("/admin?dropout=need");
  const old = await prisma.careTask.findUniqueOrThrow({ where: { id } });
  const now = new Date();
  // Ολοκλήρωση της ενέργειας (όχι του σήματος): το «Χωρίς επαφή» μένει μέχρι να υπάρξει νέα επαφή.
  const t = await prisma.careTask.update({ where: { id }, data: { doneAt: now, doneById: admin.id, note: enc(note), ...(old.claimedAt ? {} : { claimedById: admin.id, claimedByName: admin.name, claimedAt: now }) } });
  await logAccess(admin.id, t.memberId, "dropout_call");
  redirect("/admin");
}

export default async function AdminToday({ searchParams }: { searchParams: Promise<{ dropout?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("ADMIN");
  // Εφεδρεία της αυτόματης εκκαθάρισης (αν δεν έτρεξε σήμερα από το χρονοπρογραμματισμένο): μία φορά την ημέρα.
  await runRetentionDaily().catch((e) => console.error("[retention]", e));
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [todays, missed, help, unsettled, requests, flags, pairs, attendance, members, unassigned] = await Promise.all([
    prisma.slot.findMany({
      where: { date: today, bookings: { some: {} } },
      include: { therapist: { select: { name: true } }, bookings: { include: { member: { select: { name: true } } } }, note: { select: { id: true } }, pairNotes: { select: { id: true } } },
      orderBy: [{ hour: "asc" }, { position: "asc" }],
    }),
    prisma.booking.findMany({
      // Χωρίς παρουσία: «Δεν ήρθε» (επιβεβαίωση) ή χωρίς καταγραφή (ούτε πάτημα ούτε επιβεβαίωση).
      where: { OR: [{ confirmedCame: false }, { confirmedCame: null, joinedAt: null }], slot: { date: { gte: addDays(today, -7) }, startsAt: { lt: new Date(now.getTime() - s.sessionMinutes * 60_000) } } },
      include: { slot: true, member: { select: { name: true } } },
      orderBy: { slot: { startsAt: "desc" } },
    }),
    prisma.helpRequest.findMany({ where: { resolvedAt: null, createdAt: { gte: dayAgo } }, include: { member: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.cycle.findMany({ where: { settledAt: null, member: { active: true } }, include: { member: { select: { id: true, name: true } } }, orderBy: { startedAt: "asc" } }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
    prisma.booking.count({ where: { alternationOk: false, slot: { startsAt: { gt: now } } } }),
    prisma.slot.count({ where: { kind: "PAIR", pairApprovedAt: null, startsAt: { gt: now }, bookings: { some: {} } } }),
    prisma.attendance.count({ where: { date: today } }),
    prisma.user.count({ where: { role: "MEMBER", active: true } }),
    prisma.slot.count({ where: { date: { gte: today, lte: addDays(today, 7) }, therapistId: null } }),
  ]);

  // Μέλη χωρίς ολοκληρωμένη έναρξη συνεργασίας (λίστα 01–04).
  const activeMembers = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true, source: true } });
  const intakes = await Promise.all(activeMembers.map(async (m) => ({ m, status: (await memberIntake(m)).status })));
  const intakePending = intakes.filter((x) => !x.status.complete);

  // Εκκρεμεί από ψυχολόγο (δρομολόγηση, όχι προθεσμία): αξιολόγηση αναγκών ασφάλειας που θέλει αφορμή, ή αρχική αξιολόγηση
  // που δεν έγινε — και ποια είναι η επόμενη ατομική του μέλους (με ποιον, τι τύπου). Με την εναλλαγή κλινικού/βιωματικού
  // η επόμενη ατομική μπορεί να είναι με βιωματικό, που δεν την κάνει· η διαχείριση φτιάχνει το πρόγραμμα, άρα το βλέπει εδώ.
  const assessedIds = new Set((await prisma.assessment.findMany({ where: { complete: true, memberId: { in: activeMembers.map((m) => m.id) } }, select: { memberId: true }, distinct: ["memberId"] })).map((r) => r.memberId));
  const openClinician = await prisma.actionItem.findMany({ where: { doneAt: null, kind: { in: ["safety_assessment", "initial_assessment"] }, memberId: { in: activeMembers.map((m) => m.id) } }, select: { memberId: true, kind: true, claimedByName: true } });
  const psyRows = (await Promise.all(activeMembers.map(async (m) => {
    const trig = await riskTriggerDue(m.id, now);
    // Η αρχική αξιολόγηση γίνεται από το πρωτόκολλο στην 1η ατομική, από όποιον θεραπευτή την έχει (16–17/10): δεν είναι εκκρεμότητα ψυχολόγου.
    const initial = false as boolean;
    if (!trig && !initial) return null;
    const next = await nextSession(m.id, now);
    const claimed = openClinician.find((a) => a.memberId === m.id && a.kind === (trig ? "safety_assessment" : "initial_assessment"))?.claimedByName ?? null;
    return { m, trig, initial, next, claimed, nextIsPsy: next ? next.kind === "CLINICAL" || next.kind === "BOTH" : false };
  }))).filter((x): x is NonNullable<typeof x> => Boolean(x));

  // Χωρίς επαφή 3 μέρες: ποιον παίρνουμε τηλέφωνο (κινητό από τα στοιχεία του μέλους ή του λογαριασμού).
  const dropouts = await prisma.careTask.findMany({ where: { kind: { in: ["dropout", "risk_contact", "risk_24h", "risk_next_day"] }, doneAt: null }, orderBy: { dueAt: "asc" } });
  const dropoutRows = await Promise.all(dropouts.map(async (t) => {
    const [u, p] = await Promise.all([prisma.user.findUnique({ where: { id: t.memberId }, select: { name: true, phone: true } }), latestProfile(t.memberId)]);
    return { t, name: u?.name ?? "Μέλος", phone: p?.data.mobile || u?.phone || "" };
  }));

  // Κύκλοι που ολοκληρώθηκαν: κλείνουν μόνοι τους (εφεδρεία του cron, 17/10) και ανοίγουν εκκρεμότητα «Νέος κύκλος» εδώ.
  await autoCloseCycles(undefined, now).catch((e) => console.error("[cycle-auto-close]", e));
  const newCycles = await prisma.careTask.findMany({ where: { kind: "new_cycle", doneAt: null }, orderBy: { createdAt: "asc" } }).then(async (rows) => {
    const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ t: r, name: names.get(r.memberId) ?? "Μέλος" }));
  });
  // Σημειώματα που εκκρεμούν (17/10): οι θεραπευτές κλειδώνονται μέχρι να τα γράψουν· η διαχείριση βλέπει ποιος και ποια.
  const pendingNotes = await pendingNotesAll(now).catch((e) => (console.error("[note-gate]", e), []));
  // Φάκελοι που λήγουν μέσα σε 30 μέρες (τήρηση δεδομένων, 16/10): διαγράφονται αυτόματα — εδώ για να προλάβει αναστολή.
  const expiring = await expiringSoon(now).catch(() => []);
  const todo = [
    expiring.length > 0 && { href: "/admin/retention", text: `Τήρηση δεδομένων: ${expiring.length} ${expiring.length === 1 ? "φάκελος λήγει" : "φάκελοι λήγουν"} μέσα σε 30 μέρες (ο πιο κοντινός σε ${Math.min(...expiring.map((e) => e.left))} ${Math.min(...expiring.map((e) => e.left)) === 1 ? "μέρα" : "μέρες"}) — διαγράφονται αυτόματα` },
    requests && { href: "/admin/requests", text: `${requests} ${requests === 1 ? "αίτημα" : "αιτήματα"} αλλαγής ραντεβού` },
    flags && { href: "/admin/bookings", text: `${flags} ραντεβού ${flags === 1 ? "θέλει" : "θέλουν"} έλεγχο εναλλαγής βιωματικού/κλινικού` },
    pairs && { href: "/admin/bookings", text: `${pairs} Therapair ${pairs === 1 ? "θέλει" : "θέλουν"} έγκριση ζευγαριού` },
    unassigned && { href: "/admin/slots", text: `${unassigned} ${unassigned === 1 ? "θέση" : "θέσεις"} τις επόμενες 7 μέρες χωρίς θεραπευτή` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <h1>Καλώς ήρθες, {vocative(me.name.split(" ")[0])}</h1>
      <p className="hint" style={{ margin: "-6px 0 4px" }}>{formatDate(today)} · διαχείριση</p>
      <p className="motto">{mottoFor(today)}</p>
      <StaffMessagesLine userId={me.id} />
      <AlertBoxes boxes={await alertBoxes("ADMIN")} />

      {help.length > 0 && (
        <section className="card" style={{ borderColor: "var(--red)" }}>
          <strong>Κόκκινο κουμπί — τελευταίο 24ωρο</strong>
          <ul>
            {help.map((h) => (
              <li key={h.id}>
                {h.member.name} · {h.createdAt.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })} ·{" "}
                {h.claimedByName ? <span className="badge ok">το ανέλαβε: {h.claimedByName}</span> : <span className="badge red">δεν το ανέλαβε κανείς</span>}
              </li>
            ))}
          </ul>
          <Link href="/admin/help">Όλα</Link>
        </section>
      )}

      {psyRows.length > 0 && (
        <section className="card" style={{ borderColor: psyRows.some((r) => r.trig?.overdue) ? "var(--red)" : "var(--yellow)" }} data-tour="psy-route">
          <strong>Εκκρεμεί από ψυχολόγο — πού θα γίνει</strong>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>Αξιολόγηση αναγκών ασφάλειας (μετά από αφορμή) και αρχική αξιολόγηση τις κάνει μόνο ψυχολόγος. Με την εναλλαγή κλινικού/βιωματικού, η επόμενη ατομική μπορεί να είναι με βιωματικό· εδώ φαίνεται για να το ρυθμίσει η διαχείριση. <strong>Προθεσμία αξιολόγησης αναγκών (απόφαση 14/10): μέχρι την επόμενη ατομική με ψυχολόγο, το πολύ 7 μέρες από την αφορμή.</strong> Όταν περάσει: κόκκινο εδώ και στο «Σήμερα» της ομάδας, και μήνυμα στη διαχείριση μία φορά την ημέρα.</p>
          <ul>
            {psyRows.map(({ m, trig, initial, next, claimed, nextIsPsy }) => (
              <li key={m.id}>
                <Link href={`/t/members/${m.id}${trig ? "/risk" : "/assessment"}`}>{m.name}</Link>: {trig ? <>αξιολόγηση αναγκών ασφάλειας (μετά από {trig.text}, {formatDate(localParts(trig.at).date)} · εκκρεμεί {Math.max(0, Math.floor((now.getTime() - trig.at.getTime()) / 86_400_000))} μέρες) · προθεσμία {formatDate(localParts(trig.dueAt).date)}{trig.overdue && <strong className="warn-text" style={{ color: "var(--red)" }}> — ΕΚΠΡΟΘΕΣΜΗ {trig.daysOverdue > 0 && `(${trig.daysOverdue} ${trig.daysOverdue === 1 ? "μέρα" : "μέρες"})`}</strong>}</> : "αρχική αξιολόγηση (δεν έγινε)"}
                {" · "}{claimed ? <span className="badge ok">ανέλαβε: {claimed}</span> : <span className="badge yellow">χωρίς ανάληψη</span>}
                {" · "}επόμενη ατομική: {next ? <>{formatDate(next.date)} {formatTime(next.startsAt)}{next.therapist && ` · ${next.therapist}`}{next.kind && ` (${kindWord(next.kind)})`}{!nextIsPsy && <strong className="warn-text"> — όχι ψυχολόγος</strong>}</> : <strong className="warn-text">δεν έχει προγραμματιστεί</strong>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingNotes.length > 0 && (
        <section className="card" style={{ borderColor: "var(--yellow)" }}>
          <strong>Σημειώματα που εκκρεμούν</strong>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>Συνεδρίες που τελείωσαν χωρίς σημείωμα (7 μέρες). Ο θεραπευτής δεν μπορεί να συνεχίσει στο Apex μέχρι να το γράψει — εκτός από λογαριασμό με «απλή αρχική» (επισκέπτης), που δεν κλειδώνεται.</p>
          <ul>
            {pendingNotes.map((pn) => (
              <li key={pn.id}>{pn.therapistName}: <Link href={`/t/s/${pn.id}`}>{pn.kind === "PAIR" ? "Therapair" : "Ατομική"} · {pn.who} · {formatDate(localParts(pn.startsAt).date)} {formatTime(pn.startsAt)}</Link>{pn.therapistSimple && <span className="hint"> · απλή αρχική: δεν κλειδώνεται</span>}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <strong>Εκκρεμότητες</strong>
        {todo.length === 0 && unsettled.length === 0 && intakePending.length === 0 && newCycles.length === 0 ? (
          <p className="muted">Τίποτα δεν περιμένει ✓</p>
        ) : (
          <ul>
            {todo.map((t) => <li key={t.text}><Link href={t.href}>{t.text}</Link></li>)}
            {intakePending.map(({ m, status }) => (
              <li key={`intake-${m.id}`}>
                Έναρξη συνεργασίας: <Link href={`/t/members/${m.id}/start`}>{m.name}</Link>{" "}
                <span className="small muted">(λείπουν {[...status.missingSteps.map((x) => x.doc), ...status.missingConsents.map((x) => x.doc)].join(", ")})</span>
              </li>
            ))}
            {newCycles.map(({ t, name }) => (
              <li key={`nc-${t.id}`} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span>Έκλεισε ο κύκλος (αρχειοθετήθηκε αυτόματα {formatDate(localParts(t.createdAt).date)}): <Link href={`/admin/people/${t.memberId}`}>{name}</Link> — νέος κύκλος: ενημέρωση, συμφωνητικό, προεξόφληση</span>
                <form action={newCycleDone} className="row" style={{ gap: 6 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <input name="note" placeholder="σύντομα (προαιρετικό)" maxLength={500} style={{ minWidth: 160 }} />
                  <button type="submit" style={{ padding: "4px 10px" }}>Έγινε</button>
                </form>
              </li>
            ))}
            {unsettled.map((c) => (
              <li key={c.id} className="row" style={{ gap: 8 }}>
                <span>Νέος κύκλος — εκκρεμεί τακτοποίηση: <Link href={`/admin/people/${c.member.id}`}>{c.member.name}</Link> (από {formatDate(localParts(c.startedAt).date)})</span>
                <form action={settle}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" style={{ padding: "4px 10px" }}>Τακτοποιήθηκε</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid2">
        <div className="card"><span className="muted small">Ενεργά μέλη</span><div><strong>{members}</strong></div></div>
        <div className="card"><span className="muted small">Παρουσίες ομάδας σήμερα</span><div><strong>{attendance}</strong></div></div>
        <div className="card"><span className="muted small">Ατομικές/Therapair σήμερα</span><div><strong>{todays.length}</strong></div></div>
      </div>

      {dropoutRows.length > 0 && (
        <section className="card" style={{ borderColor: "var(--yellow)" }}>
          <strong>Τηλεφωνική επικοινωνία από τη διαχείριση</strong>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>«Χωρίς επαφή»: 3 μέρες δεν μπήκε σε ομάδα, δεν έγραψε απογραφή, δεν μπήκε σε ατομική — ουδέτερο μήνυμα: «Γεια, από το Apex. Σε σκεφτόμαστε, πάρε μας όταν μπορείς.» «Ανάγκες ασφάλειας»: επαφή μέσα σε 24 ώρες (Αυξημένες) ή την επόμενη μέρα (Υψηλές). Κάθε τηλεφώνημα το αναλαμβάνει ένα πρόσωπο· το «Έγινε» ολοκληρώνει την ενέργεια, <strong>όχι το σήμα</strong> — το «Χωρίς επαφή» μένει ορατό μέχρι να υπάρξει νέα επαφή.</p>
          {sp.dropout === "need" && <div className="error small">Γράψε σύντομα τι έγινε.</div>}
          {dropoutRows.map(({ t, name, phone }) => (
            <form key={t.id} action={dropoutDone} className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <input type="hidden" name="id" value={t.id} />
              <strong style={{ minWidth: 140 }}>{name} <span className="badge yellow">{t.kind === "dropout" ? "αφορμή: χωρίς επαφή" : "αφορμή: ανάγκες ασφάλειας"}</span></strong>
              <span className="small">{t.claimedAt ? `Έχει αναληφθεί από ${t.claimedByName ?? "—"} · ${formatTime(t.claimedAt)}` : <button type="submit" formAction={claimAction} className="outline">Το αναλαμβάνω</button>}</span>
              <input type="hidden" name="source" value="care" />
              <input type="hidden" name="ref" value={t.id} />
              <input type="hidden" name="back" value="/admin" />
              {phone ? <a className="btn" href={`tel:${phone.replace(/\s/g, "")}`}>Κλήση {phone}</a> : <span className="muted small">χωρίς τηλέφωνο</span>}
              <input name="note" placeholder="τι έγινε (π.χ. μιλήσαμε, είναι καλά)" style={{ flex: 1, minWidth: 160 }} />
              <button type="submit">Έγινε</button>
            </form>
          ))}
        </section>
      )}

      <h2>Σήμερα</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Ώρα</th><th>Δωμ.</th><th>Μέλος</th><th>Θεραπευτής</th><th>Μπήκε</th><th>Σημείωμα</th></tr></thead>
          <tbody>
            {todays.map((x) => (
              <tr key={x.id}>
                <td>{formatHour(x.hour)}</td>
                <td>{x.position}</td>
                <td>{x.kind === "PAIR" && "Therapair: "}{x.bookings.map((b) => b.member.name).join(" & ")}</td>
                <td>{x.therapist?.name ?? <span className="badge red">κανείς</span>}</td>
                <td>{x.bookings.map((b) => (b.confirmedCame === true ? "✓ σημείωμα" : b.confirmedCame === false ? "δεν ήρθε" : b.joinedAt ? "✓ από σύνδεση" : "—")).join(" · ")}</td>
                <td>{(x.note || x.pairNotes.length) ? <Link href={`/t/s/${x.id}`}>✓</Link> : "—"}</td>
              </tr>
            ))}
            {todays.length === 0 && <tr><td colSpan={6} className="muted">Κανένα ραντεβού.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Χωρίς παρουσία (τελευταίες 7 μέρες)</h2>
      <div className="card">
        {missed.length === 0 ? <span className="muted">Κανείς.</span> : (
          <ul>{missed.map((b) => <li key={b.id}>{b.member.name} · {formatDate(b.slot.date)} {formatHour(b.slot.hour)} · {b.confirmedCame === false ? "«Δεν ήρθε» (επιβεβαίωση θεραπευτή)" : "χωρίς καταγραφή"}</li>)}</ul>
        )}
        <p className="muted small">«Μπήκε» σημαίνει ότι πάτησε το κουμπί του app.</p>
      </div>
    </>
  );
}
