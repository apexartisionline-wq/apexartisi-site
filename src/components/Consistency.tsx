import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PicturePanel } from "@/components/PicturePanel";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { keepHistory } from "@/lib/history";
import { describeGroupPicture, describeJournal, describePct, describeSessions, GROUP_MISS, pct, type MemberPicture } from "@/lib/picture";
import { periodQuery, picturesFor, type PeriodChoice } from "@/lib/picture-db";
import { daysBetween, formatDate, localParts } from "@/lib/time";
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
 * «Συνέπεια» (14/10): μία γραμμή ανά μέλος, πάνω στην ΚΟΙΝΗ εικόνα περιόδου (src/lib/picture.ts, picture-db.ts) — οι ίδιοι
 * αριθμοί και τα ίδια κείμενα με το «Με μια ματιά» και τον φάκελο. Περίοδος: «Εβδομάδα» (τελευταίες 7 ημέρες, με βελάκια)
 * ή «Μήνας» (ο τρέχων κύκλος κάθε μέλους, με τις δικές του ημερομηνίες).
 * Κανόνας παρουσίας (13/10): ομάδες = πραγματικό πρόγραμμα μετά την ένταξη, παρουσία ή «χωρίς καταγραφή» (εκκρεμεί)·
 * «δεν έγινε» εκτός· ατομικές = επιβεβαίωση θεραπευτή ή «Μπες» του μέλους, «Δεν ήρθε» υπερισχύει· ακυρωμένες/μεταφερμένες
 * δεν μετρούν. Ποσοστό μόνο με κείμενο. «Χαμηλότερη συμμετοχή» = ομάδες < 60% ή τουλάχιστον ένα «Δεν ήρθε» στις ατομικές
 * (όχι τα «χωρίς καταγραφή» — απόφαση 14/10).
 */
export async function Consistency({ choice, basePath, canEdit, sort = "groups", low = false }: {
  choice: PeriodChoice;
  basePath: string;
  canEdit: boolean;
  sort?: ConsistencySort;
  low?: boolean;
}) {
  const now = new Date();
  const today = localParts(now).date;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, programStartDate: true } });
  const pictures = await picturesFor(members.map((m) => m.id), choice, now);
  const activeMember = { member: { role: "MEMBER" as const, active: true } };
  const [lastGroup, lastSession, lastJournal] = await Promise.all([
    // Τελευταία καταγεγραμμένη δραστηριότητα (από οποιαδήποτε περίοδο, όχι μόνο το διάστημα).
    prisma.attendance.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
    // Τελευταία ατομική με παρουσία (επιβεβαίωση ή «Από σύνδεση»).
    prisma.booking.findMany({ where: { ...activeMember, OR: [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }] }, select: { memberId: true, slot: { select: { date: true } } } }),
    prisma.journalEntry.groupBy({ by: ["memberId"], where: activeMember, _max: { date: true } }),
  ]);
  // Μέρες ομάδας όπου καταγράφηκε έστω ένα μέλος (για την ένδειξη «κανένα μέλος δεν καταγράφηκε»).
  const groupDates = [...new Set([...pictures.values()].flatMap((p) => p.groups.items.filter((g) => g.state === "no_record").map((g) => g.date)))];
  const recordedDays = new Set((groupDates.length ? await prisma.attendance.findMany({ where: { date: { in: groupDates } }, distinct: ["date"], select: { date: true } }) : []).map((r) => r.date));
  const lastG = new Map(lastGroup.map((r) => [r.memberId, r._max.date]));
  const lastS = new Map<string, string>();
  for (const b of lastSession) if ((lastS.get(b.memberId) ?? "") < b.slot.date) lastS.set(b.memberId, b.slot.date);
  const lastJ = new Map(lastJournal.map((r) => [r.memberId, r._max.date]));

  const all = members.map((m) => {
    const pic = pictures.get(m.id)!;
    const notStarted = Boolean(m.programStartDate && m.programStartDate > today);
    const candidates: { date: string; kind: string }[] = [];
    for (const [date, kind] of [[lastG.get(m.id), "ομάδα"], [lastS.get(m.id), "ατομική"], [lastJ.get(m.id), "ημερολόγιο"]] as const) if (date) candidates.push({ date, kind });
    const lastDate = candidates.reduce<string | null>((x, c) => (!x || c.date > x ? c.date : x), null);
    const lastKinds = candidates.filter((c) => c.date === lastDate).map((c) => c.kind);
    const unrecorded = pic.groups.items.filter((g) => g.state === "no_record" && !recordedDays.has(g.date)).length;
    return {
      m, pic, notStarted, lastDate, lastKinds, unrecorded,
      low: (pic.groups.pct !== null && pic.groups.pct < LOW_GROUPS) || pic.sessions.absent > 0,
    };
  });

  const score = (n: number | null) => n ?? 101; // «χωρίς μέτρηση» στο τέλος
  const byName = (a: (typeof all)[number], b: (typeof all)[number]) => a.m.name.localeCompare(b.m.name, "el");
  const rows = all.filter((r) => !low || r.low);
  rows.sort((a, b) => {
    if (sort === "name") return byName(a, b);
    const key = (r: (typeof all)[number]) => (sort === "sessions" ? score(r.pic.sessions.pct) : sort === "journal" ? score(pct(r.pic.journal.written, r.pic.journal.days)) : score(r.pic.groups.pct));
    return key(a) - key(b) || byName(a, b);
  });

  const href = (p: { choice?: PeriodChoice; sort?: ConsistencySort; low?: boolean }) => {
    const q = new URLSearchParams(periodQuery(p.choice ?? choice));
    const so = p.sort ?? sort;
    if (so !== "groups") q.set("sort", so);
    if (p.low ?? low) q.set("low", "1");
    return `${basePath}?${q}`;
  };
  const folder = (id: string) => (canEdit ? `/admin/people/${id}` : `/t/members/${id}`);
  const weekLabel = choice.kind === "week" ? [...pictures.values()][0]?.period.label ?? "" : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Συνέπεια</h1>
          <p className="page-sub">
            {choice.kind === "week" ? weekLabel : "Μήνας = ο τρέχων κύκλος κάθε μέλους (8 ατομικές, 16 ομάδες), με τις δικές του ημερομηνίες"} · {rows.length} {rows.length === 1 ? "μέλος" : "μέλη"}
            {low && ` από ${all.length} (μόνο χαμηλότερη συμμετοχή)`}
          </p>
        </div>
        <nav className="head-actions ptabs" aria-label="Περίοδος">
          <Link href={href({ choice: { kind: "week", back: 0 } })} className={`ptab${choice.kind === "week" ? " on" : ""}`} aria-current={choice.kind === "week" ? "page" : undefined}>Εβδομάδα</Link>
          <Link href={href({ choice: { kind: "month", index: null } })} className={`ptab${choice.kind === "month" ? " on" : ""}`} aria-current={choice.kind === "month" ? "page" : undefined}>Μήνας</Link>
          {choice.kind === "week" && (
            <span className="ptab-when">
              <Link href={href({ choice: { kind: "week", back: choice.back + 1 } })} aria-label="Προηγούμενες 7 ημέρες">‹ πριν</Link>
              {choice.back > 0 && <> · <Link href={href({ choice: { kind: "week", back: choice.back - 1 } })} aria-label="Επόμενες 7 ημέρες">μετά ›</Link></>}
            </span>
          )}
        </nav>
      </div>

      <section className={`panel ${styles.def}`}>
        <p>
          <strong>Παρουσίες / που πέρασαν</strong>: μετράνε οι ομάδες και οι ατομικές του πραγματικού προγράμματος που έληξαν, από την ένταξη του μέλους,
          και όσες είναι «χωρίς καταγραφή» (εκκρεμεί — όχι απουσία). Ακυρωμένες, μεταφερμένες και ομάδες που «δεν έγιναν» δεν μετρούν πουθενά· φαίνονται μόνο ως πληροφορία.
          <strong> Ημερολόγιο</strong>: καταχωρίσεις / μέρες που μπορούσαν να έχουν καταχώριση. <strong>Τελευταία καταγεγραμμένη δραστηριότητα</strong> = η πιο πρόσφατη μέρα με παρουσία σε ομάδα ή ατομική, ή με ημερολόγιο.
        </p>
        <p className="hint">Οι συνεδρίες που δεν έχουν τελειώσει ακόμα δεν μετράνε. Πάτα ένα μέλος για κάθε συνεδρία, την πηγή της παρουσίας και το ημερολόγιο ως αριθμούς.</p>
        <details className="fold">
          <summary>Τι σημαίνει κάθε ένδειξη</summary>
          <ul className={styles.legend}>
            <li><b>παρουσία · από σύνδεση</b> — το μέλος πάτησε «Μπες»· μετράει ως παρουσία πριν γραφτεί το σημείωμα. Το πάτημα του θεραπευτή δεν μετράει για το μέλος. Δεν είναι επιβεβαίωση από το Zoom.</li>
            <li><b>παρουσία · επιβεβαίωση θεραπευτή</b> — σημείωμα «Ήρθε».</li>
            <li><b>«Δεν ήρθε»</b> — σημείωμα «Δεν ήρθε». Υπερισχύει του πατήματος «Μπες», που μένει στο ιστορικό.</li>
            <li><b>χωρίς καταγραφή · εκκρεμεί</b> — έληξε η ώρα, ούτε πάτημα ούτε επιβεβαίωση. Μένει στον παρονομαστή (το ποσοστό το λέει ρητά), αλλά δεν είναι απουσία.</li>
            <li><b>ακυρώθηκε / μεταφέρθηκε</b> — δεν μετρά σε κανένα κλάσμα. Η μεταφερμένη μετρά στη νέα της ημερομηνία.</li>
            <li><b>Ομάδες</b> — «παρουσία» (πάτησε «Μπες στην ομάδα» ή το σημείωσε η διαχείριση) ή «Δεν ήρθε» (δεν πάτησε «Μπες»). Δεν σημειώνεται με το χέρι: βγαίνει από το κουμπί σύνδεσης του μέλους (16/10)· η διαχείριση διορθώνει μόνο αν το πάτημα δεν καταγράφηκε. Αν τελικά <b>δεν έγινε</b>, ο συντονιστής ή η διαχείριση το σημειώνει εκ των υστέρων και δεν μετράει για κανέναν. Αν δεν καταγράφηκε κανένα μέλος εκείνη τη μέρα, ίσως δεν κρατήθηκε παρουσία.</li>
            <li><b>Ποσοστό</b> — μόνο δίπλα στο πλήρες κείμενο «Χ από Υ που πέρασαν» και μόνο όταν πέρασε τουλάχιστον μία.</li>
            <li><b>Χαμηλότερη συμμετοχή</b> — ομάδες κάτω από {LOW_GROUPS}% ή τουλάχιστον ένα «Δεν ήρθε» στις ατομικές. Τα «χωρίς καταγραφή» των ατομικών δεν μπαίνουν στο φίλτρο. Είναι φίλτρο, όχι αξιολόγηση.</li>
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
            {rows.map((r) => <Row key={r.m.id} r={r} today={today} canEdit={canEdit} folder={folder(r.m.id)} />)}
          </ul>
          </>
        )}
      </section>
    </>
  );
}

function Row({ r, today, canEdit, folder }: { r: { m: { id: string; name: string; programStartDate: string | null }; pic: MemberPicture; notStarted: boolean; lastDate: string | null; lastKinds: string[]; unrecorded: number }; today: string; canEdit: boolean; folder: string }) {
  const { sessions: s, groups: g, journal: j, period } = r.pic;
  const unit = <span className={styles.unit}>παρουσίες / που πέρασαν</span>;
  return (
    <li>
      <details className={`fold ${styles.member}`}>
        <summary>
          <span className={styles.sum}>
            <span className={styles.name}>
              <Link href={folder} className={styles.namelink}>{r.m.name}</Link>
              {r.notStarted && <span className="pill grey">ξεκινά {formatDate(r.m.programStartDate!)}</span>}
            </span>
            <span className={styles.metric}>
              <span className={styles.mlabel}>Ομάδες</span>
              {g.passed === 0 ? <span className="muted">{g.scheduled ? "καμία δεν πέρασε ακόμα" : "καμία στο πρόγραμμα"}</span> : <span><b>{g.present}/{g.passed}</b> {unit}</span>}
              <span className={styles.unit}>{describeGroupPicture(g)}</span>
              {g.pct !== null && g.pct < LOW_GROUPS && <span className="pill yellow">κάτω από {LOW_GROUPS}%</span>}
            </span>
            <span className={styles.metric}>
              <span className={styles.mlabel}>Ατομικές</span>
              {s.passed === 0 ? <span className="muted">{s.scheduled ? "καμία δεν πέρασε ακόμα" : "δεν είχε ατομική"}</span> : <span><b>{s.present}/{s.passed}</b> {unit}</span>}
              <span className={styles.unit}>{describeSessions(s)}</span>
              {s.absent > 0 && <span className="pill yellow">{s.absent} «Δεν ήρθε»</span>}
            </span>
            <span className={styles.metric}>
              <span className={styles.mlabel}>Ημερολόγια</span>
              {j.days === 0 ? <span className="muted">—</span> : <span><b>{j.written}/{j.days}</b> <span className={styles.unit}>καταχωρίσεις / ημέρες</span></span>}
              <span className={styles.unit}>{describeJournal(j)}</span>
            </span>
            <span className={`${styles.metric} ${styles.last}`}>
              <span className={styles.mlabel}>Τελευταία δραστηριότητα</span>
              {r.lastDate ? <span>{short(r.lastDate)} · {r.lastKinds.join(", ")} <span className={styles.unit}>({ago(r.lastDate, today)})</span></span> : <span className="muted">καμία καταγραφή ακόμα</span>}
            </span>
          </span>
        </summary>

        <div className={styles.detail}>
          <p className="hint" style={{ margin: 0 }}>
            {period.label}{period.clippedFrom && ` · μετρά από ${formatDate(period.clippedFrom)} (έναρξη προγράμματος)`}. {g.pct !== null && <>Ομάδες: {describePct(g, GROUP_MISS)}. </>}{s.pct !== null && <>Ατομικές: {describePct(s)}. </>}
            <Link href={folder}>Φάκελος ›</Link>
          </p>
          {r.unrecorded > 0 && <p className="hint" style={{ margin: "4px 0 0" }}>{r.unrecorded} {r.unrecorded === 1 ? "ομάδα" : "ομάδες"} χωρίς «Μπες» από κανένα μέλος· μετρούν ως «Δεν ήρθε». Αν η ομάδα έγινε, ίσως τα μέλη μπήκαν χωρίς το κουμπί της εφαρμογής{canEdit ? " (η διαχείριση το διορθώνει εδώ)" : ""}· αν δεν έγινε, σημειώνεται «Δεν έγινε» στη σελίδα της ομάδας.</p>}
          <PicturePanel pic={r.pic} journalHref={`/t/members/${r.m.id}/journal`} />
          {canEdit && g.items.some((x) => x.state !== "not_held" && x.state !== "future") && (
            <>
              <h3>Διόρθωση παρουσίας ομάδας</h3>
              <ul className={styles.days}>
                {g.items.filter((x) => x.state !== "not_held" && x.state !== "future").map((d) => {
                  const present = d.state === "present";
                  return (
                    <li key={`${d.date} ${d.time}`}>
                      <form action={toggleAttendance}>
                        <input type="hidden" name="memberId" value={r.m.id} />
                        <input type="hidden" name="date" value={d.date} />
                        <button type="submit" className={`${styles.day} ${present ? styles.ok : styles.no}`} title={present ? "Πάτα για αφαίρεση παρουσίας" : "Πάτα για προσθήκη παρουσίας"}>
                          <span>{short(d.date)} {d.time}</span> <b>{present ? "✓ παρουσία" : "«Δεν ήρθε»"}</b>
                          <span className={styles.fix}>{present ? "Αφαίρεση" : "Προσθήκη"}</span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </details>
    </li>
  );
}

export function parseSort(v: string | undefined): ConsistencySort {
  return SORTS.some((o) => o.key === v) ? (v as ConsistencySort) : "groups";
}

export function parseLow(v: string | undefined): boolean {
  return v === "1";
}
