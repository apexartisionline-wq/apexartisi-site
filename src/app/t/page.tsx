import { Announcements } from "@/components/Announcements";
import Link from "next/link";
import { JoinButton } from "@/components/JoinButton";
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
import { addDays, formatDate, formatHour, localParts } from "@/lib/time";

async function careDone(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  await prisma.careTask.update({
    where: { id: String(formData.get("id")) },
    data: { doneAt: new Date(), doneById: user.id, note: enc(String(formData.get("note") ?? "").slice(0, 500)) },
  });
  redirect("/t");
}

const CARE = { caring_24h: "Μήνυμα φροντίδας (24 ώρες μετά από κρίση)", caring_7d: "Μήνυμα φροντίδας (7 μέρες μετά από κρίση)", dropout: "Χωρίς επαφή μέρες: να επικοινωνήσει κάποιος", risk_24h: "Αυξημένες ανάγκες ασφάλειας: επαφή μέσα σε 24 ώρες", risk_next_day: "Υψηλές ανάγκες ασφάλειας: επαφή σήμερα" } as Record<string, string>;

type Item = { key: string; time: string; title: string; sub: string; href: string; join?: { kind: "SLOT" | "GROUP"; ref: string; room: string } };

// «Σήμερα»: το πρόγραμμα του θεραπευτή σε μία λίστα, με «Σύνδεση» σε κάθε γραμμή,
// και από κάτω μόνο όσα πρέπει να δει πριν ξεκινήσει.
export default async function TherapistDay({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const today = localParts(new Date()).date;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const s = await getSettings();

  const [boxes, care, slots, week, groups, members] = await Promise.all([
    alertBoxes(user.role),
    prisma.careTask.findMany({ where: { doneAt: null, dueAt: { lte: new Date() }, kind: { not: "dropout" } }, orderBy: { dueAt: "asc" } }),
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
  ]);
  const myGroups = groups.filter((g) => g.coordinatorId === user.id);
  const names = (x: { bookings: { member: { name: string } }[] }) => x.bookings.map((b) => b.member.name).join(" & ");
  // Στη λίστα: μικρό όνομα και αρχικό, για να χωράει στο κινητό (π.χ. «Γιώργος Δ. & Ελένη Δ.»).
  const short = (x: { bookings: { member: { name: string } }[] }) =>
    x.bookings.map((b) => b.member.name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")).join(" & ");
  const isToday = date === today;

  const items: Item[] = [
    ...myGroups.filter((g) => g.date === date).map((g) => ({
      key: `g${g.time}`,
      time: g.time,
      title: "Ομάδα",
      sub: g.hasNote ? "Εσύ συντονίζεις · σύνοψη ✓" : "Εσύ συντονίζεις",
      href: `/t/group/${g.date}/${g.time.replace(":", "")}`,
      join: { kind: "GROUP" as const, ref: `${g.date} ${g.time}`, room: s.groupRoomUrl },
    })),
    ...slots.map((x) => ({
      key: x.id,
      time: formatHour(x.hour),
      title: short(x),
      sub: `${x.kind === "PAIR" ? "Therapair" : "Ατομική"}${(x.note || x.pairNotes.length) ? " · σημείωμα ✓" : ""}`,
      href: `/t/s/${x.id}`,
      join: { kind: "SLOT" as const, ref: x.id, room: s.rooms[x.position - 1] ?? "" },
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  // Να το δεις: εκκρεμότητες για όποιον το δει πρώτος και μέλη με κόκκινο σήμα.
  // Ό,τι φαίνεται ήδη στο κουτί πάνω-πάνω δεν ξαναβγαίνει εδώ· τα υπόλοιπα σήματα του μέλους μένουν.
  const inBox = new Set(boxes.flatMap((b) => b.items.filter((a) => a.source === "ASSESSMENT").map((a) => `${b.id}:assessment_${a.kind}`)));
  const red = (await Promise.all(members.map(async (m) => ({ m, f: (await memberSafety(m.id)).filter((x) => (x.level === "red" || x.key === "risk_review") && !inBox.has(`${m.id}:${x.key}`)) }))))
    .filter((x) => x.f.length > 0)
    .slice(0, 8);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const reviews = await dueCycleReviews(members.map((m) => m.id));

  return (
    <main>
      <div className="row spread" style={{ alignItems: "baseline" }}>
        <h1 style={{ margin: "8px 0 0" }}>{isToday ? "Σήμερα" : formatDate(date)}</h1>
        <span className="row" style={{ gap: 6 }}>
          <Link className="btn" href={`/t?date=${addDays(date, -1)}`} aria-label="Προηγούμενη μέρα">‹</Link>
          {!isToday && <Link className="btn" href="/t">Σήμερα</Link>}
          <Link className="btn" href={`/t?date=${addDays(date, 1)}`} aria-label="Επόμενη μέρα">›</Link>
        </span>
      </div>
      <p className="muted" style={{ margin: "2px 0 0" }}>{formatDate(date)} · {user.name}</p>

      <AlertBoxes boxes={boxes} />

      <Announcements />

      <div className="today-grid">
      <section className="t-prog">
      <h2>Το πρόγραμμά μου</h2>
      <div className="list">
        {items.map((it) => (
          <div key={it.key}>
            <strong style={{ width: 52, flex: "none", fontVariantNumeric: "tabular-nums" }}>{it.time}</strong>
            <Link href={it.href} style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
              <div className="title">{it.title}</div>
              <div className="sub">{it.sub}</div>
            </Link>
            {isToday && it.join ? (
              <JoinButton kind={it.join.kind} refId={it.join.ref} roomUrl={it.join.room} next={it.href} />
            ) : (
              <Link href={it.href} className="muted" aria-label="Άνοιγμα">›</Link>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="muted">Δεν έχεις ομάδα ή συνεδρία αυτή τη μέρα.</div>}
      </div>
      {isToday && items.length > 0 && <p className="muted small">Το «Σύνδεση» ανοίγει το Zoom και καταγράφει την ώρα που μπήκες.</p>}
      </section>

      {(care.length > 0 || red.length > 0 || reviews.length > 0) && (
        <section className="t-see">
          <h2>Να το δεις</h2>
          <div className="list">
            {red.map(({ m, f }) => (
              <Link key={m.id} href={`/t/members/${m.id}`}>
                <span className={`dot ${f[0].level}`} />
                <span><div className="title">{m.name}</div><div className="sub">{f[0].text}{f.length > 1 && ` · +${f.length - 1}`}</div></span>
              </Link>
            ))}
            {reviews.map((r) => (
              <Link key={`cr${r.memberId}`} href={`/t/members/${r.memberId}/cycle`}>
                <span className="dot" />
                <span><div className="title">{memberName.get(r.memberId) ?? "Μέλος"}</div><div className="sub">Τέλος κύκλου: ανασκόπηση (2 γραμμές)</div></span>
              </Link>
            ))}
            {care.map((c) => (
              <form key={c.id} action={careDone}>
                <input type="hidden" name="id" value={c.id} />
                <span className="dot yellow" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className="title"><Link href={`/t/members/${c.memberId}`}>{memberName.get(c.memberId) ?? "Μέλος"}</Link></div>
                  <div className="sub">{CARE[c.kind] ?? c.kind}</div>
                  <input name="note" placeholder="σύντομα: τι έγινε" style={{ marginTop: 6 }} />
                </span>
                <button type="submit">Έγινε</button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="t-week">
      <h2>Τις επόμενες 7 μέρες</h2>
      <div className="list">
        {/* Ομάδες και ατομικές μαζί, με σειρά ημέρας και ώρας. */}
        {[
          ...myGroups.filter((g) => g.date > date).map((g) => ({ key: `${g.date}${g.time}`, sort: `${g.date} ${g.time}`, date: g.date, when: `${formatDate(g.date)} ${g.time}`, sub: "Ομάδα · εσύ συντονίζεις" })),
          ...week.map((x) => ({ key: x.id, sort: `${x.date} ${formatHour(x.hour)}`, date: x.date, when: `${formatDate(x.date)} ${formatHour(x.hour)}`, sub: `${x.kind === "PAIR" ? "Therapair" : "Ατομική"} · ${names(x)}` })),
        ]
          .sort((a, b) => a.sort.localeCompare(b.sort))
          .map((r) => (
            <Link key={r.key} href={`/t?date=${r.date}`}><span><div>{r.when}</div><div className="sub">{r.sub}</div></span></Link>
          ))}
        {week.length === 0 && myGroups.filter((g) => g.date > date).length === 0 && <div className="muted">Τίποτα.</div>}
      </div>
      </section>
      </div>
    </main>
  );
}
