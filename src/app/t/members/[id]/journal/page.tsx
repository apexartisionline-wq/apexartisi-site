import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound } from "next/navigation";
import { seesJournalDetail } from "@/lib/access";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { GOAL_CHECK, goalChecksFor, type GoalCheck } from "@/lib/goals";
import { SELF_HARM } from "@/lib/journal-labels";
import { PicturePanel } from "@/components/PicturePanel";
import { memberPicture, parsePeriod, periodQuery } from "@/lib/picture-db";
import { addDays, formatDate, localParts } from "@/lib/time";

const DAYS = 14;
const isDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const num = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));

// Οι απογραφές (ημερολόγιο ανάκαμψης) ενός μέλους. Η διαχείριση τις βλέπει μέρα-μέρα με όλες τις απαντήσεις.
// Οι θεραπευτές (διευκρίνιση 14/10 της απόφασης 13/10): στη σύνοψη μόνο αριθμοί — καταχωρίσεις / μέρες της περιόδου,
// μέσοι όροι με το πλήθος, σήματα — και μία γραμμή ανά μέρα με τους αριθμούς της· ανοίγοντας μια μέρα βλέπουν
// ολόκληρη την καταχώριση (σελίδα journal/[date], με υδατογράφημα και καταγραφή πρόσβασης).
export default async function MemberJournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string; p?: string; w?: string; m?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { name: true } });
  if (!member) notFound();
  const detail = seesJournalDetail(user);
  await logAccess(user.id, id, detail ? "journal_view" : "journal_stats_view");

  const today = localParts(new Date()).date;
  const to = isDate(sp.to) && sp.to! <= today ? sp.to! : today;
  const from = addDays(to, -(DAYS - 1));
  const rows = await prisma.journalEntry.findMany({
    where: { memberId: id, date: { gte: from, lte: to } },
    orderBy: { date: "desc" },
    // Οι θεραπευτές δεν παίρνουν καν τα κείμενα από τη βάση.
    select: { date: true, mood: true, craving: true, sleepHours: true, confidence: true, used: true, selfHarm: true, ...(detail ? { note: true, win: true } : {}) },
  });
  const gcs = await goalChecksFor([id], from, to);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(to, -i));
  const older = addDays(from, -1);
  const newer = addDays(to, DAYS);
  const nav = (
    <div className="row" style={{ gap: 6, margin: "8px 0 12px" }}>
      <Link className="btn" href={`/t/members/${id}/journal?to=${older}`}>‹ Παλαιότερες</Link>
      {to < today && <Link className="btn" href={newer >= today ? `/t/members/${id}/journal` : `/t/members/${id}/journal?to=${newer}`}>Νεότερες ›</Link>}
    </div>
  );

  if (!detail) {
    const choice = parsePeriod(sp);
    const pic = await memberPicture(id, choice, new Date());
    const j = pic.journal;
    const base = `/t/members/${id}/journal`;
    const link = (c: typeof choice) => `${base}?${periodQuery(c)}`;
    const current = choice.kind === "month" ? (choice.index && choice.index <= pic.cycles.length ? choice.index : pic.cycles.length) : null;
    // Όλες οι μέρες της περιόδου που μπορούσαν να έχουν εγγραφή, με τους αριθμούς τους· κάθε μέρα ανοίγει ολόκληρη.
    const days: string[] = [];
    if (j.from && j.to) for (let d = j.to; d >= j.from; d = addDays(d, -1)) days.push(d);
    const byDay = new Map(j.entries.map((e) => [e.date, e]));
    return (
      <main>
        <p className="small"><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
        <FolderTabs memberId={id} active="journal" />
        <h1 style={{ marginBottom: 4 }}>Απογραφές</h1>
        <p className="muted" style={{ marginTop: 0 }}>Ημερολόγιο ανάκαμψης · {pic.period.label}</p>
        <div className="ptabs" role="navigation" aria-label="Περίοδος">
          <Link href={link({ kind: "week", back: 0 })} className={`ptab${choice.kind === "week" ? " on" : ""}`} aria-current={choice.kind === "week" ? "page" : undefined}>Εβδομάδα</Link>
          <Link href={link({ kind: "month", index: null })} className={`ptab${choice.kind === "month" ? " on" : ""}`} aria-current={choice.kind === "month" ? "page" : undefined}>Μήνας</Link>
          {choice.kind === "week" && (
            <span className="ptab-when">
              <Link href={link({ kind: "week", back: choice.back + 1 })}>‹ πριν</Link>
              {choice.back > 0 && <> · <Link href={link({ kind: "week", back: choice.back - 1 })}>μετά ›</Link></>}
            </span>
          )}
          {choice.kind === "month" && pic.cycles.length > 1 && (
            <span className="ptab-when">{pic.cycles.map((c) => (c.index === current ? <b key={c.index}> Μήνας {c.index}</b> : <Link key={c.index} href={link({ kind: "month", index: c.index })} style={{ marginLeft: 6 }}>Μήνας {c.index}</Link>))}</span>
          )}
        </div>
        <div className="card stack" data-tour="journal-stats">
          <PicturePanel pic={pic} canOpenDays={false} compact />
        </div>
        <h2 style={{ fontSize: "1.1rem", margin: "14px 0 6px" }}>Οι μέρες, μία-μία</h2>
        <p className="hint" style={{ margin: "0 0 8px" }}>Εδώ μόνο αριθμοί. Πάτα μια μέρα για ολόκληρη την καταχώριση (σημείωση και νίκη) — η προβολή καταγράφεται.</p>
        {days.length === 0 ? <div className="empty">Καμία μέρα της περιόδου δεν μπορεί να έχει καταχώριση ακόμα.</div> : (
          <ul className="pic-list">
            {days.map((d) => {
              const e = byDay.get(d);
              if (!e) return <li key={d} className="muted"><span>{formatDate(d)}</span><b>δεν έγραψε</b></li>;
              const flag = e.used || e.selfHarm;
              return (
                <li key={d}>
                  <span><Link href={`${base}/${d}`}>{formatDate(d)} ›</Link></span>
                  <b>διάθεση {e.mood}/10 · λαχτάρα {e.craving}/10 · ύπνος {String(e.sleep).replace(".", ",")} ώρ. · σιγουριά {e.confidence}/10</b>
                  {e.goalCheck && <span className="hint">στόχος: {GOAL_CHECK[e.goalCheck as GoalCheck] ?? e.goalCheck}</span>}
                  {flag && <span className="badge red">{[e.used ? "χρήση" : "", e.selfHarm ? "σκέψεις να κάνει κακό στον εαυτό του" : ""].filter(Boolean).join(" · ")}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    );
  }

  return (
    <main>
      <p className="small"><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="journal" />
      <h1 style={{ marginBottom: 4 }}>Απογραφές</h1>
      <p className="muted" style={{ marginTop: 0 }}>Ημερολόγιο ανάκαμψης · {formatDate(from)} – {formatDate(to)} · έγραψε {rows.length} από {DAYS} μέρες</p>
      {nav}
      <div className="journal-days">
        {days.map((d) => {
          const j = byDate.get(d);
          if (!j) return <div key={d} className="card journal-day empty"><strong>{formatDate(d)}</strong> <span className="muted">· δεν έγραψε</span></div>;
          const flag = j.used || j.selfHarm === "YES" || j.selfHarm === "UNSURE";
          const note = dec(j.note), win = dec(j.win);
          const gc = gcs.get(`${id}|${d}`);
          const goalCheck = gc?.check ?? null, goalNote = gc?.note ?? "";
          return (
            <section key={d} className={`card journal-day${flag ? " flag" : ""}`}>
              <div className="row spread"><strong>{formatDate(d)}</strong>{flag && <span className="badge red">να το δεις</span>}</div>
              <div className="journal-nums">
                <span><b>{j.mood}</b>/10 διάθεση</span>
                <span><b>{j.craving}</b>/10 λαχτάρα</span>
                <span><b>{String(j.sleepHours).replace(".", ",")}</b> ώρες ύπνου</span>
                <span><b>{j.confidence}</b>/10 σιγουριά για αύριο</span>
              </div>
              <ul className="journal-ans">
                <li>Χρήση: {j.used ? <strong className="warn-text">ναι</strong> : "όχι"}</li>
                <li>Σκέψεις να κάνει κακό στον εαυτό του: {j.selfHarm === "YES" || j.selfHarm === "UNSURE" ? <strong className="warn-text">{SELF_HARM[j.selfHarm]}</strong> : SELF_HARM[j.selfHarm]}</li>
                {goalCheck && <li>Συνεπής με τον στόχο: <strong>{GOAL_CHECK[goalCheck as GoalCheck] ?? goalCheck}</strong>{goalNote && <> — «{goalNote}»</>}</li>}
                {win && <li>Μια νίκη σήμερα: «{win}»</li>}
              </ul>
              {note && <div className="body-text journal-note">{note}</div>}
            </section>
          );
        })}
      </div>
    </main>
  );
}
