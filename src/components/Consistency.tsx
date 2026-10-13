import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { keepHistory } from "@/lib/history";
import { groupOccurrences } from "@/lib/groups";
import { memberGroups } from "@/lib/group-presence";
import { getSettings } from "@/lib/settings";
import { countPresence, PRESENCE_LABEL, PRESENCE_UNIT, sessionPresence, type Presence } from "@/lib/presence";
import { addDays, daysBetween, formatDate, formatTime, localParts } from "@/lib/time";
import styles from "./Consistency.module.css";

// Η Εύα μπορεί να διορθώσει μια παρουσία (π.χ. μπήκε στην ομάδα χωρίς το κουμπί του app).
async function toggleAttendance(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const date = String(formData.get("date"));
  const existing = await prisma.attendance.findUnique({ where: { memberId_date: { memberId, date } } });
  // Η αφαίρεση κρατιέται στο ιστορικό (ποιος, πότε, τι ήταν).
  if (existing) await prisma.$transaction([keepHistory("attendance_removed", { memberId, ref: date, before: existing, byId: user.id }), prisma.attendance.delete({ where: { id: existing.id } })]);
  // Και η χειροκίνητη προσθήκη κρατά ποιος την έκανε.
  else await prisma.$transaction([prisma.attendance.create({ data: { memberId, date } }), keepHistory("attendance_added", { memberId, ref: date, before: null, byId: user.id })]);
  revalidatePath("/admin/consistency");
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 100));
const LOW_GROUPS = 60; // % — κάτω από αυτό η γραμμή μπαίνει στο φίλτρο «χαμηλότερη συμμετοχή» (ίδιο όριο με πριν)

export type ConsistencySort = "groups" | "sessions" | "journal" | "name";
const SORTS: { key: ConsistencySort; label: string }[] = [
  { key: "groups", label: "Λιγότερες ομάδες πρώτα" },
  { key: "sessions", label: "Λιγότερες ατομικές πρώτα" },
  { key: "journal", label: "Λιγότερα ημερολόγια πρώτα" },
  { key: "name", label: "Όνομα" },
];

const short = (d: string) => {
  const [day, dm] = formatDate(d).split(" ");
  return `${day.slice(0, 3)} ${dm}`;
};
const ago = (d: string, today: string) => {
  const n = daysBetween(d, today);
  return n <= 0 ? "σήμερα" : n === 1 ? "χθες" : `πριν από ${n} μέρες`;
};

/*
 * «Συνέπεια»: σύντομη λίστα ανά μέλος, με τις λεπτομέρειες σε άνοιγμα.
 * Οι μετρήσεις είναι οι ίδιες με memberConsistency (src/lib/handover.ts) / cycleInfo (src/lib/member.ts) / cyclePicture.
 * Κανόνας (διευκρινίσεις υπεύθυνης 13/10 — βλ. docs/reviews/2026-10-13-diefkriniseis-parousies.md):
 *  - Ομάδες: παρονομαστής = ομάδες του ΠΡΑΓΜΑΤΙΚΟΥ προγράμματος (GroupSession με ημερομηνία) για το μέλος, που έληξαν,
 *    από την ένταξή του και δεν ακυρώθηκαν — και χωρίς καταγραφή παρουσίας. Δεν «φτιάχνονται» ομάδες από συνήθεις μέρες.
 *    Παρουσία = Attendance (πάτησε «Μπες στην ομάδα» ή το σημείωσε η διαχείριση)· παρουσία σε μέρα χωρίς ομάδα δεν μετράει.
 *  - Ατομικές (και Therapair): παρονομαστής = προγραμματισμένες που πέρασαν (έληξε η ώρα τους) ή έχουν ήδη καταγραφή.
 *    Παρουσία = επιβεβαίωση θεραπευτή (Booking.confirmedCame), αλλιώς πάτημα «Μπες» του μέλους («Από σύνδεση»).
 *    Η επιβεβαίωση «Δεν ήρθε» υπερισχύει του πατήματος, που μένει στο ιστορικό.
 *  - Χωρίς πάτημα ή επιβεβαίωση: «χωρίς καταγραφή» — μένει στον παρονομαστή, ΔΕΝ είναι απουσία.
 *  - Ημερολόγια: εγγραφές (JournalEntry.date) από την έναρξη ως σήμερα, σε σχέση με τις μέρες του διαστήματος.
 *
 * Ανοιχτά (θέλουν απόφαση της υπεύθυνης):
 *  1. Ομάδα όπου δεν καταγράφηκε ΚΑΝΕΝΑ μέλος (π.χ. δεν κρατήθηκε παρουσία) μετράει στον παρονομαστή όλων ως «χωρίς καταγραφή»·
 *     οι ομάδες δεν ακυρώνονται ποτέ (υπεύθυνη 13/10), άρα κάθε ομάδα του προγράμματος έγινε.
 *  2. Στα ημερολόγια ο παρονομαστής περιλαμβάνει και τη σημερινή μέρα, ενώ η σημερινή εγγραφή γράφεται μόνο μετά την ώρα
 *     του ημερολογίου (journalDate)· μέχρι τότε όλοι φαίνονται με μία μέρα «λιγότερη».
 */
export async function Consistency({
  weeks,
  basePath,
  canEdit,
  sort = "groups",
  low = false,
}: {
  weeks: number;
  basePath: string;
  canEdit: boolean;
  sort?: ConsistencySort;
  low?: boolean;
}) {
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const from = addDays(today, -7 * weeks + 1);
  const horizon = addDays(today, 7); // μελλοντικές ατομικές: μόνο για να φαίνονται, δεν μετράνε

  // Ομάδες από το πραγματικό πρόγραμμα (γεγονότα με ημερομηνία)· μετράνε όσες έληξαν (απόφαση 13/10). Οι ομάδες δεν ακυρώνονται.
  const occ = await groupOccurrences(from, today, s, now);
  const groupDates = [...new Set(occ.filter((o) => o.endsAt <= now).map((o) => o.date))];
  const todayGroupPending = occ.some((o) => o.date === today && o.endsAt > now);

  const activeMember = { member: { role: "MEMBER" as const, active: true } };
  const [members, recorded, lastGroup, lastSession, lastJournal] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        programStartDate: true,
        attendances: { where: { date: { gte: from } }, select: { date: true, joinedAt: true } },
        bookings: {
          where: { slot: { date: { gte: from, lte: horizon } } },
          select: {
            id: true,
            joinedAt: true,
            confirmedCame: true,
            slot: { select: { date: true, hour: true, startsAt: true, kind: true } },
          },
        },
        journal: { where: { date: { gte: from } }, select: { date: true } },
      },
    }),
    // Μέρες ομάδας όπου καταγράφηκε έστω ένα μέλος (για την ένδειξη «καμία καταγραφή εκείνη τη μέρα»).
    prisma.attendance.findMany({ where: { date: { in: groupDates } }, distinct: ["date"], select: { date: true } }),
    // Τελευταία καταγεγραμμένη δραστηριότητα (από οποιαδήποτε περίοδο, όχι μόνο το διάστημα).
    prisma.attendance.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
    // Τελευταία ατομική με παρουσία (επιβεβαίωση ή «Από σύνδεση»).
    prisma.booking.findMany({ where: { ...activeMember, OR: [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }] }, select: { memberId: true, slot: { select: { date: true } } } }),
    prisma.journalEntry.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
  ]);
  const recordedDays = new Set(recorded.map((r) => r.date));
  const lastG = new Map(lastGroup.map((r) => [r.memberId, r._max.date]));
  const lastS = new Map<string, string>();
  for (const b of lastSession) if ((lastS.get(b.memberId) ?? "") < b.slot.date) lastS.set(b.memberId, b.slot.date);
  const lastJ = new Map(lastJournal.map((r) => [r.memberId, r._max.date]));

  const all = members.map((m) => {
    const start = m.programStartDate && m.programStartDate > from ? m.programStartDate : from;
    const notStarted = Boolean(m.programStartDate && m.programStartDate > today);
    const g = memberGroups(occ.filter((o) => o.date >= start), m.attendances, { now, joinDate: m.programStartDate });
    const groupDays = g.rows.filter((r) => r.state === "present" || r.state === "no_record").map((r) => ({ date: r.date, time: r.time, present: r.state === "present", noneRecorded: r.state !== "present" && !recordedDays.has(r.date) }));
    const groups = g.counted;
    // Ίδιο διάστημα με τον φάκελο (memberConsistency): μόνο μετά την έναρξη του προγράμματος του μέλους.
    const sessions = m.bookings
      .filter((b) => b.slot.date >= start)
      .sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime())
      .map((b) => {
        const state: Presence = sessionPresence({ startsAt: b.slot.startsAt, endsAt: new Date(b.slot.startsAt.getTime() + (b.slot.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000), now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame });
        return { id: b.id, date: b.slot.date, startsAt: b.slot.startsAt, pair: b.slot.kind === "PAIR", state, joinedAt: b.joinedAt };
      });
    const counts = countPresence(sessions.map((x) => x.state));
    // Παρουσία = επιβεβαίωση θεραπευτή, αλλιώς πάτημα «Μπες» του μέλους («Από σύνδεση»)· παρονομαστής = όσες πέρασαν.
    const sessionsDone = counts.counted;
    const journalDays = Math.max(0, daysBetween(start, today) + 1);
    const journalDates = m.journal.filter((j) => j.date >= start).map((j) => j.date).sort();

    const candidates: { date: string; kind: string }[] = [];
    for (const [date, kind] of [[lastG.get(m.id), "ομάδα"], [lastS.get(m.id), "ατομική"], [lastJ.get(m.id), "ημερολόγιο"]] as const) {
      if (date) candidates.push({ date, kind });
    }
    const lastDate = candidates.reduce<string | null>((x, c) => (!x || c.date > x ? c.date : x), null);
    const lastKinds = candidates.filter((c) => c.date === lastDate).map((c) => c.kind);

    const groupPct = pct(groups, g.passed);
    return {
      m,
      start,
      notStarted,
      groupDays,
      groups,
      groupPct,
      unrecorded: groupDays.filter((d) => d.noneRecorded).length,
      sessions,
      sessionsDone,
      sessionsTotal: counts.timePassed,
      sessionsMissed: counts.timePassed - sessionsDone,
      counts,
      noNote: counts.noRecord,
      future: counts.upcoming,
      journal: journalDates.length,
      journalDates,
      journalDays,
      lastDate,
      lastKinds,
      low: (groupPct !== null && groupPct < LOW_GROUPS) || counts.timePassed - sessionsDone > 0,
    };
  });

  const score = (n: number | null) => n ?? 101; // «χωρίς μέτρηση» στο τέλος
  const byName = (a: (typeof all)[number], b: (typeof all)[number]) => a.m.name.localeCompare(b.m.name, "el");
  const rows = all.filter((r) => !low || r.low);
  rows.sort((a, b) => {
    if (sort === "name") return byName(a, b);
    const key = (r: (typeof all)[number]) =>
      sort === "sessions" ? score(pct(r.sessionsDone, r.sessionsTotal)) : sort === "journal" ? score(pct(r.journal, r.journalDays)) : score(r.groupPct);
    return key(a) - key(b) || byName(a, b);
  });

  const href = (p: { weeks?: number; sort?: ConsistencySort; low?: boolean }) => {
    const q = new URLSearchParams({ weeks: String(p.weeks ?? weeks) });
    const so = p.sort ?? sort;
    if (so !== "groups") q.set("sort", so);
    if (p.low ?? low) q.set("low", "1");
    return `${basePath}?${q}`;
  };
  const folder = (id: string) => (canEdit ? `/admin/people/${id}` : `/t/members/${id}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Συνέπεια</h1>
          <p className="page-sub">
            Από {formatDate(from)} έως σήμερα · {rows.length} {rows.length === 1 ? "μέλος" : "μέλη"}
            {low && ` από ${all.length} (μόνο χαμηλότερη συμμετοχή)`}
          </p>
        </div>
        <nav className="head-actions" aria-label="Περίοδος">
          {[2, 4, 8].map((w) => (
            <Link key={w} href={href({ weeks: w })} className={`btn${w === weeks ? " primary" : " outline"}`} aria-current={w === weeks ? "page" : undefined}>
              {w} εβδομάδες
            </Link>
          ))}
        </nav>
      </div>

      <section className={`panel ${styles.def}`}>
        <p>
          <strong>Παρουσίες / προγραμματισμένες που πέρασαν</strong>: μετράνε οι ομάδες και οι ατομικές του πραγματικού προγράμματος που έληξαν, από την ένταξη του μέλους,
          και όσες δεν έχουν καταγραφή. <strong>Τελευταία καταγεγραμμένη δραστηριότητα</strong> = η πιο πρόσφατη μέρα με παρουσία σε ομάδα
          ή ατομική, ή με ημερολόγιο.
        </p>
        <p className="hint">
          Οι συνεδρίες που δεν έχουν τελειώσει ακόμα δεν μετράνε. Πάτα ένα μέλος για τις μέρες και την πηγή κάθε παρουσίας.
        </p>
        <details className="fold">
          <summary>Τι σημαίνει κάθε ένδειξη</summary>
          <ul className={styles.legend}>
            <li><b>παρουσία · Από σύνδεση</b> — το μέλος πάτησε «Μπες»· μετράει ως παρουσία πριν γραφτεί το σημείωμα. Το πάτημα του θεραπευτή δεν μετράει για το μέλος. Δεν είναι επιβεβαίωση από το Zoom.</li>
            <li><b>παρουσία · Επιβεβαίωση θεραπευτή</b> — σημείωμα «Ήρθε».</li>
            <li><b>δεν ήρθε</b> — σημείωμα «Δεν ήρθε». Υπερισχύει του πατήματος «Μπες», που μένει στο ιστορικό.</li>
            <li><b>χωρίς καταγραφή</b> — έληξε η ώρα, ούτε πάτημα ούτε επιβεβαίωση. Μένει στον παρονομαστή, αλλά δεν είναι απουσία.</li>
            <li><b>Ομάδες</b> — «παρουσία» (πάτησε «Μπες στην ομάδα» ή το σημείωσε η διαχείριση) ή «χωρίς καταγραφή». Δεν υπάρχει επιβεβαιωμένη απουσία ομάδας. Οι ομάδες δεν ακυρώνονται. Αν δεν καταγράφηκε κανένα μέλος εκείνη τη μέρα, ίσως δεν κρατήθηκε παρουσία.</li>
            <li><b>δεν είχε ατομική</b> — καμία ατομική στο διάστημα· δεν είναι απουσία.</li>
            <li><b>μελλοντική</b> — δεν έχει φτάσει η ώρα (επόμενες 7 μέρες)· δεν μετράει.</li>
            <li><b>Χαμηλότερη συμμετοχή</b> — ομάδες κάτω από {LOW_GROUPS}% ή τουλάχιστον μία ατομική χωρίς παρουσία (δεν σημαίνει απουσία). Είναι φίλτρο, όχι αξιολόγηση.</li>
          </ul>
        </details>
      </section>

      <div className={styles.controls}>
        <nav className={styles.group} aria-label="Ταξινόμηση">
          <span className="hint">Ταξινόμηση:</span>
          {SORTS.map((o) => (
            <Link key={o.key} href={href({ sort: o.key })} className={`btn${o.key === sort ? " primary" : ""}`} aria-current={o.key === sort ? "true" : undefined}>
              {o.label}
            </Link>
          ))}
        </nav>
        <Link href={href({ low: !low })} className={`btn${low ? " primary" : ""}`} aria-pressed={low}>
          {low ? "✓ Μόνο χαμηλότερη συμμετοχή" : "Μόνο χαμηλότερη συμμετοχή"}
        </Link>
      </div>
      {todayGroupPending && <p className="hint" style={{ margin: "0 0 8px" }}>Η σημερινή ομάδα δεν έχει ξεκινήσει ακόμα· δεν μετράει.</p>}
      {canEdit && <p className="hint" style={{ margin: "0 0 8px" }}>Για να διορθώσεις μια παρουσία ομάδας, άνοιξε το μέλος και πάτα τη μέρα. Η διόρθωση κρατιέται στο ιστορικό.</p>}

      <section className="panel">
        {rows.length === 0 ? (
          <p className="empty">
            {all.length === 0 ? "Δεν υπάρχουν ενεργά μέλη." : <>Κανένα μέλος με χαμηλότερη συμμετοχή σε αυτό το διάστημα. <Link href={href({ low: false })}>Δείξε όλα τα μέλη</Link></>}
          </p>
        ) : (
          <>
          <div className={styles.head} aria-hidden="true"><span>Μέλος</span><span>Ομάδες</span><span>Ατομικές</span><span>Ημερολόγια</span><span>Τελευταία δραστηριότητα</span></div>
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.m.id}>
                <details className={`fold ${styles.member}`}>
                  <summary>
                    <span className={styles.sum}>
                      <span className={styles.name}>
                        <Link href={folder(r.m.id)} className={styles.namelink}>{r.m.name}</Link>
                        {r.notStarted && <span className="pill grey">ξεκινά {formatDate(r.m.programStartDate!)}</span>}
                      </span>
                      <span className={styles.metric}>
                        <span className={styles.mlabel}>Ομάδες</span>
                        {r.groupDays.length === 0 ? <span className="muted">καμία ακόμα</span> : (
                          <span><b>{r.groups}/{r.groupDays.length}</b> <span className={styles.unit}>{PRESENCE_UNIT}</span></span>
                        )}
                        {r.groupDays.length - r.groups > 0 && <span className={styles.unit}>{r.groupDays.length - r.groups} χωρίς καταγραφή</span>}
                        {r.groupPct !== null && r.groupPct < LOW_GROUPS && <span className="pill yellow">κάτω από {LOW_GROUPS}%</span>}
                      </span>
                      <span className={styles.metric}>
                        <span className={styles.mlabel}>Ατομικές</span>
                        {r.sessionsTotal === 0 ? <span className="muted">δεν είχε ατομική</span> : (
                          <span><b>{r.sessionsDone}/{r.sessionsTotal}</b> <span className={styles.unit}>{PRESENCE_UNIT}</span></span>
                        )}
                        {r.noNote > 0 && <span className={styles.unit}>{r.noNote} χωρίς καταγραφή</span>}
                        {r.counts.confirmedAbsent > 0 && <span className={styles.unit}>{r.counts.confirmedAbsent} «Δεν ήρθε»</span>}
                      </span>
                      <span className={styles.metric}>
                        <span className={styles.mlabel}>Ημερολόγια</span>
                        {r.journalDays === 0 ? <span className="muted">—</span> : (
                          <span><b>{r.journal}/{r.journalDays}</b> <span className={styles.unit}>έγραψε / μέρες</span></span>
                        )}
                      </span>
                      <span className={`${styles.metric} ${styles.last}`}>
                        <span className={styles.mlabel}>Τελευταία δραστηριότητα</span>
                        {r.lastDate ? (
                          <span>{short(r.lastDate)} · {r.lastKinds.join(", ")} <span className={styles.unit}>({ago(r.lastDate, today)})</span></span>
                        ) : <span className="muted">καμία καταγραφή ακόμα</span>}
                      </span>
                    </span>
                  </summary>

                  <div className={styles.detail}>
                    <p className="hint" style={{ margin: 0 }}>
                      {r.start > from ? `Μετράει από ${formatDate(r.start)} (έναρξη προγράμματος).` : `Μετράει από ${formatDate(from)}.`}{" "}
                      <Link href={folder(r.m.id)}>Φάκελος ›</Link>
                    </p>

                    <h3>Ομάδες</h3>
                    {r.groupDays.length === 0 ? <p className="empty">Καμία προγραμματισμένη ομάδα στο διάστημα.</p> : (
                      <ul className={styles.days}>
                        {r.groupDays.map((d) => {
                          const word = d.present ? "παρουσία" : d.noneRecorded ? "χωρίς καταγραφή · κανένα μέλος δεν καταγράφηκε σε αυτή την ομάδα" : "χωρίς καταγραφή";
                          const tone = d.present ? styles.ok : d.noneRecorded ? styles.grey : styles.no;
                          return (
                            <li key={`${d.date} ${d.time}`}>
                              {canEdit ? (
                                <form action={toggleAttendance}>
                                  <input type="hidden" name="memberId" value={r.m.id} />
                                  <input type="hidden" name="date" value={d.date} />
                                  <button type="submit" className={`${styles.day} ${tone}`} title={d.present ? "Πάτα για αφαίρεση παρουσίας" : "Πάτα για προσθήκη παρουσίας"}>
                                    <span>{short(d.date)} {d.time}</span> <b>{d.present ? "✓ " : ""}{word}</b>
                                    <span className={styles.fix}>{d.present ? "Αφαίρεση" : "Προσθήκη"}</span>
                                  </button>
                                </form>
                              ) : (
                                <span className={`${styles.day} ${tone}`}><span>{short(d.date)} {d.time}</span> <b>{d.present ? "✓ " : ""}{word}</b></span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {r.unrecorded > 0 && <p className="hint" style={{ margin: "4px 0 0" }}>{r.unrecorded} {r.unrecorded === 1 ? "μέρα" : "μέρες"} χωρίς καμία καταγραφή από κανένα μέλος· μένουν στον παρονομαστή ως «χωρίς καταγραφή» (ίσως δεν κρατήθηκε παρουσία· η διαχείριση τη διορθώνει εδώ).</p>}

                    <h3>Ατομικές και Therapair</h3>
                    {r.sessions.length === 0 ? <p className="empty">Δεν είχε ατομική σε αυτό το διάστημα ούτε τις επόμενες 7 μέρες.</p> : (
                      <ul className={styles.sessions}>
                        {r.sessions.map((x) => {
                          const st = PRESENCE_LABEL[x.state];
                          return (
                            <li key={x.id}>
                              <span>{formatDate(x.date)}, {formatTime(x.startsAt)} · {x.pair ? "Therapair" : "ατομική"}</span>
                              <span className={`pill ${st.tone === "accent" ? "" : st.tone}`}>{x.state === "present_confirmed" || x.state === "present_join" ? "✓ " : ""}{st.word}</span>
                              <span className={styles.unit}>{st.source}{x.joinedAt && x.state !== "present_join" ? ` · πάτημα «Μπες» του μέλους ${formatTime(x.joinedAt)} (στο ιστορικό)` : ""}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <h3>Ημερολόγια</h3>
                    {r.journalDays === 0 ? <p className="empty">Το διάστημα δεν έχει ξεκινήσει για αυτό το μέλος.</p> : r.journal === 0 ? (
                      <p className="empty">Δεν έγραψε ημερολόγιο στις {r.journalDays} μέρες του διαστήματος.</p>
                    ) : (
                      <>
                        <ul className={styles.days}>
                          {r.journalDates.map((d) => <li key={d}><span className={`${styles.day} ${styles.ok}`}><span>{short(d)}</span> <b>✓ έγραψε</b></span></li>)}
                        </ul>
                        <p className="hint" style={{ margin: "4px 0 0" }}>
                          Έγραψε {r.journal} από {r.journalDays} μέρες{r.journalDays > r.journal && ` · δεν έγραψε τις άλλες ${r.journalDays - r.journal}`}.
                        </p>
                      </>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>
    </>
  );
}

export function parseWeeks(v: string | undefined): number {
  const n = Number(v);
  return [2, 4, 8].includes(n) ? n : 4;
}

export function parseSort(v: string | undefined): ConsistencySort {
  return SORTS.some((o) => o.key === v) ? (v as ConsistencySort) : "groups";
}

export function parseLow(v: string | undefined): boolean {
  return v === "1";
}
