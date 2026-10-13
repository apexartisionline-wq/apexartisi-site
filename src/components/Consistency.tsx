import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { keepHistory } from "@/lib/history";
import { groupStarted, groupsOn } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { addDays, daysBetween, formatDate, formatHour, localParts } from "@/lib/time";
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

type SessionState = "came" | "absent_note" | "no_note" | "future";
const SESSION_STATE: Record<SessionState, { word: string; source: string; tone: string }> = {
  came: { word: "ήρθε", source: "μετρά «ήρθε» (κουμπί ή σημείωμα)", tone: "ok" },
  absent_note: { word: "δεν ήρθε", source: "σημείωμα χωρίς «Ήρθε»", tone: "yellow" },
  no_note: { word: "δεν ήρθε", source: "δεν πάτησε «Μπες» και δεν έχει γραφτεί σημείωμα ακόμα", tone: "yellow" },
  future: { word: "μελλοντική", source: "δεν έχει γίνει ακόμα · δεν μετράει", tone: "grey" },
};

/*
 * «Συνέπεια»: σύντομη λίστα ανά μέλος, με τις λεπτομέρειες σε άνοιγμα.
 * Οι μετρήσεις είναι ΑΚΡΙΒΩΣ οι ίδιες με πριν και με memberConsistency (src/lib/handover.ts) / cycleInfo (src/lib/member.ts):
 *  - Ομάδες: μέρες ομάδας από την έναρξη του μέλους ως σήμερα (η σημερινή μόνο αφού ξεκινήσει η ομάδα)· ήρθε = Attendance
 *    (πάτησε «Μπες στην ομάδα» ή το σημείωσε η διαχείριση).
 *  - Ατομικές (και Therapair): κρατήσεις με startsAt < τώρα· ήρθε = booking.joinedAt (κουμπί ή σημείωμα «Ήρθε»).
 *  - Ημερολόγια: εγγραφές (JournalEntry.date) από την έναρξη ως σήμερα, σε σχέση με τις μέρες του διαστήματος.
 * Οι ενδείξεις «καμία καταγραφή εκείνη τη μέρα» και «χωρίς σημείωμα ακόμα» είναι ΜΟΝΟ πληροφορία· δεν αλλάζουν τους αριθμούς.
 *
 * Πιθανές αλλαγές κανόνα που ΔΕΝ έγιναν (θέλουν απόφαση της υπεύθυνης):
 *  1. Μέρα ομάδας όπου δεν καταγράφηκε ΚΑΝΕΝΑ μέλος (π.χ. ομάδα που δεν έγινε ή δεν κρατήθηκε παρουσία) μετράει ως
 *     «έγινε» και ως απουσία για όλους. Ίσως πρέπει να μη μετράει.
 *  2. Οι μέρες ομάδας βγαίνουν από το ΣΗΜΕΡΙΝΟ πρόγραμμα ομάδων (ρυθμίσεις)· αν άλλαξε το πρόγραμμα μέσα στο διάστημα,
 *     οι παλιές μέρες υπολογίζονται με το νέο. Παρουσίες σε μέρα που σήμερα δεν έχει ομάδα δεν μετράνε.
 *  3. Στα ημερολόγια ο παρονομαστής περιλαμβάνει και τη σημερινή μέρα, ενώ η σημερινή εγγραφή γράφεται μόνο μετά την ώρα
 *     του ημερολογίου (journalDate)· μέχρι τότε όλοι φαίνονται με μία μέρα «λιγότερη».
 *  4. Ατομική που πέρασε χωρίς «Μπες» και χωρίς σημείωμα μετράει ήδη «δεν ήρθε», πριν γραφτεί το σημείωμα.
 *  5. Μικροδιαφορά: cycleInfo μετρά «έγινε» με startsAt <= τώρα, εδώ και στο memberConsistency με startsAt < τώρα.
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

  // Μέρες ομάδας στο διάστημα· η σημερινή μετράει μόνο αφού ξεκινήσει η ομάδα.
  const groupDates: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (groupsOn(d, s).length === 0) continue;
    if (d === today && !groupStarted(d, now, s)) continue;
    groupDates.push(d);
  }
  const todayGroupPending = groupsOn(today, s).length > 0 && !groupStarted(today, now, s);

  const activeMember = { member: { role: "MEMBER" as const, active: true } };
  const [members, recorded, lastGroup, lastSession, lastJournal] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        programStartDate: true,
        attendances: { where: { date: { gte: from } }, select: { date: true } },
        bookings: {
          where: { slot: { date: { gte: from, lte: horizon } } },
          select: {
            id: true,
            joinedAt: true,
            slot: { select: { date: true, hour: true, startsAt: true, kind: true, note: { select: { id: true } }, pairNotes: { select: { memberId: true } } } },
          },
        },
        journal: { where: { date: { gte: from } }, select: { date: true } },
      },
    }),
    // Μέρες ομάδας όπου καταγράφηκε έστω ένα μέλος (για την ένδειξη «καμία καταγραφή εκείνη τη μέρα»).
    prisma.attendance.findMany({ where: { date: { in: groupDates } }, distinct: ["date"], select: { date: true } }),
    // Τελευταία καταγεγραμμένη δραστηριότητα (από οποιαδήποτε περίοδο, όχι μόνο το διάστημα).
    prisma.attendance.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
    prisma.booking.groupBy({ by: ["memberId"], where: { ...activeMember, joinedAt: { not: null } }, _max: { joinedAt: true } }),
    prisma.journalEntry.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
  ]);
  const recordedDays = new Set(recorded.map((r) => r.date));
  const lastG = new Map(lastGroup.map((r) => [r.memberId, r._max.date]));
  const lastS = new Map(lastSession.map((r) => [r.memberId, r._max.joinedAt ? localParts(r._max.joinedAt).date : null]));
  const lastJ = new Map(lastJournal.map((r) => [r.memberId, r._max.date]));

  const all = members.map((m) => {
    const start = m.programStartDate && m.programStartDate > from ? m.programStartDate : from;
    const notStarted = Boolean(m.programStartDate && m.programStartDate > today);
    const dates = groupDates.filter((d) => d >= start);
    const present = new Set(m.attendances.map((a) => a.date));
    const groupDays = dates.map((date) => ({ date, present: present.has(date), noneRecorded: !present.has(date) && !recordedDays.has(date) }));
    const groups = groupDays.filter((d) => d.present).length;
    // Ίδιο διάστημα με τον φάκελο (memberConsistency): μόνο μετά την έναρξη του προγράμματος του μέλους.
    const sessions = m.bookings
      .filter((b) => b.slot.date >= start)
      .sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime())
      .map((b) => {
        const hasNote = Boolean(b.slot.note) || b.slot.pairNotes.some((n) => n.memberId === m.id);
        const state: SessionState = b.slot.startsAt >= now ? "future" : b.joinedAt ? "came" : hasNote ? "absent_note" : "no_note";
        return { id: b.id, date: b.slot.date, hour: b.slot.hour, pair: b.slot.kind === "PAIR", state };
      });
    const past = sessions.filter((x) => x.state !== "future");
    const sessionsDone = past.filter((x) => x.state === "came").length;
    const journalDays = Math.max(0, daysBetween(start, today) + 1);
    const journalDates = m.journal.filter((j) => j.date >= start).map((j) => j.date).sort();

    const candidates: { date: string; kind: string }[] = [];
    for (const [date, kind] of [[lastG.get(m.id), "ομάδα"], [lastS.get(m.id), "ατομική"], [lastJ.get(m.id), "ημερολόγιο"]] as const) {
      if (date) candidates.push({ date, kind });
    }
    const lastDate = candidates.reduce<string | null>((x, c) => (!x || c.date > x ? c.date : x), null);
    const lastKinds = candidates.filter((c) => c.date === lastDate).map((c) => c.kind);

    const groupPct = pct(groups, dates.length);
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
      sessionsTotal: past.length,
      sessionsMissed: past.length - sessionsDone,
      noNote: past.filter((x) => x.state === "no_note").length,
      future: sessions.length - past.length,
      journal: journalDates.length,
      journalDates,
      journalDays,
      lastDate,
      lastKinds,
      low: (groupPct !== null && groupPct < LOW_GROUPS) || past.length - sessionsDone > 0,
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
            <Link key={w} href={href({ weeks: w })} className={`btn${w === weeks ? " primary" : ""}`} aria-current={w === weeks ? "page" : undefined}>
              {w} εβδομάδες
            </Link>
          ))}
        </nav>
      </div>

      <section className={`panel ${styles.def}`}>
        <p>
          <strong>Τελευταία καταγεγραμμένη δραστηριότητα</strong> = η πιο πρόσφατη μέρα που το μέλος ήρθε σε ομάδα (πάτησε «Μπες στην ομάδα» ή το σημείωσε η
          διαχείριση), ήρθε σε ατομική (μετρά «ήρθε»: κουμπί ή σημείωμα «Ήρθε») ή έγραψε ημερολόγιο.
        </p>
        <p className="hint">
          Οι αριθμοί μετράνε μόνο μέρες μετά την έναρξη του προγράμματος του μέλους· οι συνεδρίες που δεν έχουν γίνει ακόμα δεν μετράνε. Πάτα ένα μέλος για τις μέρες.
        </p>
        <details className="fold">
          <summary>Τι σημαίνει κάθε ένδειξη</summary>
          <ul className={styles.legend}>
            <li><b>ήρθε</b> — παρουσία. Ομάδα: «Μπες στην ομάδα» ή διόρθωση της διαχείρισης. Ατομική: μετρά «ήρθε» (κουμπί ή σημείωμα «Ήρθε»).</li>
            <li><b>δεν ήρθε</b> — απουσία: ομάδα που έγινε χωρίς παρουσία του μέλους, ή ατομική που πέρασε χωρίς «ήρθε».</li>
            <li><b>καμία καταγραφή εκείνη τη μέρα</b> — μέρα ομάδας όπου δεν καταγράφηκε κανένα μέλος. Μετράει όπως πάντα (έγινε, δεν ήρθε), αλλά ίσως δεν κρατήθηκε παρουσία.</li>
            <li><b>χωρίς σημείωμα ακόμα</b> — ατομική που πέρασε χωρίς «Μπες» και χωρίς σημείωμα. Μετράει «δεν ήρθε» μέχρι να γραφτεί σημείωμα «Ήρθε».</li>
            <li><b>δεν είχε ατομική</b> — καμία ατομική στο διάστημα· δεν είναι απουσία.</li>
            <li><b>μελλοντική</b> — δεν έχει γίνει ακόμα (επόμενες 7 μέρες)· δεν μετράει.</li>
            <li><b>Χαμηλότερη συμμετοχή</b> — ομάδες κάτω από {LOW_GROUPS}% ή τουλάχιστον μία ατομική χωρίς «ήρθε». Είναι φίλτρο, όχι αξιολόγηση.</li>
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
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.m.id}>
                <details className={`fold ${styles.member}`}>
                  <summary>
                    <span className={styles.sum}>
                      <span className={styles.name}>
                        {r.m.name}
                        {r.notStarted && <span className="pill grey">ξεκινά {formatDate(r.m.programStartDate!)}</span>}
                      </span>
                      <span className={styles.metric}>
                        <span className={styles.mlabel}>Ομάδες</span>
                        {r.groupDays.length === 0 ? <span className="muted">καμία ακόμα</span> : (
                          <span><b>{r.groups}/{r.groupDays.length}</b> <span className={styles.unit}>ήρθε / έγιναν</span></span>
                        )}
                        {r.groupPct !== null && r.groupPct < LOW_GROUPS && <span className="pill yellow">κάτω από {LOW_GROUPS}%</span>}
                      </span>
                      <span className={styles.metric}>
                        <span className={styles.mlabel}>Ατομικές</span>
                        {r.sessionsTotal === 0 ? <span className="muted">δεν είχε ατομική</span> : (
                          <span><b>{r.sessionsDone}/{r.sessionsTotal}</b> <span className={styles.unit}>ήρθε / έγιναν</span></span>
                        )}
                        {r.noNote > 0 && <span className={styles.unit}>{r.noNote} χωρίς σημείωμα ακόμα</span>}
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
                    {r.groupDays.length === 0 ? <p className="empty">Δεν υπήρξε μέρα ομάδας στο διάστημα.</p> : (
                      <ul className={styles.days}>
                        {r.groupDays.map((d) => {
                          const word = d.present ? "ήρθε" : d.noneRecorded ? "δεν ήρθε · καμία καταγραφή εκείνη τη μέρα" : "δεν ήρθε";
                          const tone = d.present ? styles.ok : d.noneRecorded ? styles.grey : styles.no;
                          return (
                            <li key={d.date}>
                              {canEdit ? (
                                <form action={toggleAttendance}>
                                  <input type="hidden" name="memberId" value={r.m.id} />
                                  <input type="hidden" name="date" value={d.date} />
                                  <button type="submit" className={`${styles.day} ${tone}`} title={d.present ? "Πάτα για αφαίρεση παρουσίας" : "Πάτα για προσθήκη παρουσίας"}>
                                    <span>{short(d.date)}</span> <b>{d.present ? "✓ " : ""}{word}</b>
                                    <span className={styles.fix}>{d.present ? "Αφαίρεση" : "Προσθήκη"}</span>
                                  </button>
                                </form>
                              ) : (
                                <span className={`${styles.day} ${tone}`}><span>{short(d.date)}</span> <b>{d.present ? "✓ " : ""}{word}</b></span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {r.unrecorded > 0 && <p className="hint" style={{ margin: "4px 0 0" }}>{r.unrecorded} {r.unrecorded === 1 ? "μέρα" : "μέρες"} χωρίς καμία καταγραφή από κανένα μέλος (μετράνε ως «δεν ήρθε»).</p>}

                    <h3>Ατομικές και Therapair</h3>
                    {r.sessions.length === 0 ? <p className="empty">Δεν είχε ατομική σε αυτό το διάστημα ούτε τις επόμενες 7 μέρες.</p> : (
                      <ul className={styles.sessions}>
                        {r.sessions.map((x) => {
                          const st = SESSION_STATE[x.state];
                          return (
                            <li key={x.id}>
                              <span>{formatDate(x.date)}, {formatHour(x.hour)} · {x.pair ? "Therapair" : "ατομική"}</span>
                              <span className={`pill ${st.tone}`}>{x.state === "came" ? "✓ " : ""}{st.word}</span>
                              <span className={styles.unit}>{st.source}</span>
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
