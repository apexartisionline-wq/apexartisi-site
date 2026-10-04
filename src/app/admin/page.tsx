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
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

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
  const t = await prisma.careTask.update({ where: { id }, data: { doneAt: new Date(), doneById: admin.id, note: enc(note) } });
  await logAccess(admin.id, t.memberId, "dropout_call");
  redirect("/admin");
}

export default async function AdminToday({ searchParams }: { searchParams: Promise<{ dropout?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("ADMIN");
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
      where: { joinedAt: null, slot: { date: { gte: addDays(today, -7) }, startsAt: { lt: new Date(now.getTime() - s.sessionMinutes * 60_000) } } },
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

  // Χωρίς επαφή 3 μέρες: ποιον παίρνουμε τηλέφωνο (κινητό από τα στοιχεία του μέλους ή του λογαριασμού).
  const dropouts = await prisma.careTask.findMany({ where: { kind: { in: ["dropout", "risk_contact"] }, doneAt: null }, orderBy: { dueAt: "asc" } });
  const dropoutRows = await Promise.all(dropouts.map(async (t) => {
    const [u, p] = await Promise.all([prisma.user.findUnique({ where: { id: t.memberId }, select: { name: true, phone: true } }), latestProfile(t.memberId)]);
    return { t, name: u?.name ?? "Μέλος", phone: p?.data.mobile || u?.phone || "" };
  }));

  const todo = [
    requests && { href: "/admin/requests", text: `${requests} αιτήματα αλλαγής ραντεβού` },
    flags && { href: "/admin/bookings", text: `${flags} ραντεβού θέλουν έλεγχο εναλλαγής βιωματικού/κλινικού` },
    pairs && { href: "/admin/bookings", text: `${pairs} Therapair θέλουν έγκριση ζευγαριού` },
    unassigned && { href: "/admin/slots", text: `${unassigned} θέσεις τις επόμενες 7 μέρες χωρίς θεραπευτή` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <h1>{formatDate(today)}</h1>
      <StaffMessagesLine userId={me.id} />
      <AlertBoxes boxes={await alertBoxes("ADMIN")} />

      {help.length > 0 && (
        <section className="card" style={{ borderColor: "var(--red)" }}>
          <strong>Κόκκινο κουμπί — τελευταίο 24ωρο</strong>
          <ul>
            {help.map((h) => (
              <li key={h.id}>
                {h.member.name} · {h.createdAt.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })} ·{" "}
                {h.claimedByName ? <span className="badge ok">το ανέλαβε ο/η {h.claimedByName}</span> : <span className="badge red">δεν το ανέλαβε κανείς</span>}
              </li>
            ))}
          </ul>
          <Link href="/admin/help">Όλα</Link>
        </section>
      )}

      <section className="card">
        <strong>Εκκρεμότητες</strong>
        {todo.length === 0 && unsettled.length === 0 && intakePending.length === 0 ? (
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
          <strong>Τηλεφωνήματα της διαχείρισης</strong>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>«Χωρίς επαφή»: 3 μέρες δεν μπήκε σε ομάδα, δεν έγραψε απογραφή, δεν μπήκε σε ατομική — ουδέτερο μήνυμα: «Γεια, από το APEX. Σε σκεφτόμαστε, πάρε μας όταν μπορείς.» «Ανάγκες ασφάλειας»: επαφή μέσα σε 24 ώρες (Αυξημένες) ή την επόμενη μέρα (Υψηλές).</p>
          {sp.dropout === "need" && <div className="error small">Γράψε σύντομα τι έγινε.</div>}
          {dropoutRows.map(({ t, name, phone }) => (
            <form key={t.id} action={dropoutDone} className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <input type="hidden" name="id" value={t.id} />
              <strong style={{ minWidth: 140 }}>{name} <span className="badge yellow">{t.kind === "risk_contact" ? "ανάγκες ασφάλειας" : "χωρίς επαφή"}</span></strong>
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
                <td>{x.bookings.map((b) => (b.joinedAt ? "✓" : "—")).join(" ")}</td>
                <td>{(x.note || x.pairNotes.length) ? <Link href={`/t/s/${x.id}`}>✓</Link> : "—"}</td>
              </tr>
            ))}
            {todays.length === 0 && <tr><td colSpan={6} className="muted">Κανένα ραντεβού.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Δεν μπήκαν (τελευταίες 7 μέρες)</h2>
      <div className="card">
        {missed.length === 0 ? <span className="muted">Κανείς.</span> : (
          <ul>{missed.map((b) => <li key={b.id}>{b.member.name} · {formatDate(b.slot.date)} {formatHour(b.slot.hour)}</li>)}</ul>
        )}
        <p className="muted small">«Μπήκε» σημαίνει ότι πάτησε το κουμπί του app.</p>
      </div>
    </>
  );
}
