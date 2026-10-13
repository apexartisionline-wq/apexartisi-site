import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound } from "next/navigation";
import { seesJournalDetail } from "@/lib/access";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { GOAL_CHECK, type GoalCheck } from "@/lib/goals";
import { SELF_HARM } from "@/lib/journal-labels";
import { addDays, formatDate, localParts } from "@/lib/time";

const DAYS = 14;
const isDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const num = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));

// Οι απογραφές (ημερολόγιο ανάκαμψης) ενός μέλους. Η διαχείριση τις βλέπει μέρα-μέρα με όλες τις απαντήσεις·
// οι θεραπευτές μόνο αριθμούς (απόφαση 13/10, src/lib/access.ts) — πόσες μέρες έγραψε, μέσοι όροι, στόχος —
// και τα σήματα (χρήση, σκέψεις να κάνει κακό στον εαυτό του) ως μία γραμμή, χωρίς τα κείμενα του μέλους.
export default async function MemberJournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string }> }) {
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
    select: { date: true, mood: true, craving: true, sleepHours: true, confidence: true, used: true, selfHarm: true, goalCheck: true, ...(detail ? { note: true, win: true, goalNote: true } : {}) },
  });
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
    const goal = { YES: 0, PARTLY: 0, NO: 0 } as Record<GoalCheck, number>;
    for (const j of rows) if (j.goalCheck && j.goalCheck in GOAL_CHECK) goal[j.goalCheck as GoalCheck]++;
    const goalTotal = goal.YES + goal.PARTLY + goal.NO;
    const used = rows.filter((j) => j.used).map((j) => j.date);
    const selfHarm = rows.filter((j) => j.selfHarm === "YES" || j.selfHarm === "UNSURE").map((j) => j.date);
    const top = rows.length ? rows.reduce((a, b) => (b.craving > a.craving ? b : a)) : null;
    return (
      <main>
        <p className="small"><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
        <FolderTabs memberId={id} active="journal" />
        <h1 style={{ marginBottom: 4 }}>Απογραφές</h1>
        <p className="muted" style={{ marginTop: 0 }}>Ημερολόγιο ανάκαμψης · {formatDate(from)} – {formatDate(to)} · μόνο αριθμοί</p>
        {nav}
        <div className="card stack" data-tour="journal-stats">
          <div className="stats tiles">
            <div className="stat"><b>{rows.length}/{DAYS}</b><span>μέρες έγραψε</span></div>
            <div className="stat"><b>{num(avg(rows.map((j) => j.mood)))}</b><span>διάθεση /10</span></div>
            <div className="stat"><b>{num(avg(rows.map((j) => j.craving)))}</b><span>λαχτάρα /10</span></div>
            <div className="stat"><b>{num(avg(rows.map((j) => j.sleepHours)))}</b><span>ώρες ύπνου</span></div>
            <div className="stat"><b>{num(avg(rows.map((j) => j.confidence)))}</b><span>σιγουριά για αύριο /10</span></div>
          </div>
          {top && top.craving >= 6 && <p className="warn-text small" style={{ margin: 0 }}>Πιο δυνατή λαχτάρα: {top.craving}/10 ({formatDate(top.date)}).</p>}
          {goalTotal > 0 && <p className="small" style={{ margin: 0 }}><strong>Στόχος εβδομάδας:</strong> {GOAL_CHECK.YES} {goal.YES} · {GOAL_CHECK.PARTLY} {goal.PARTLY} · {GOAL_CHECK.NO} {goal.NO}</p>}
          {(used.length > 0 || selfHarm.length > 0) && (
            <p className="warn-text small" style={{ margin: 0 }}>
              {used.length > 0 && <>Έγραψε ότι έκανε χρήση: {used.map(formatDate).join(", ")}. </>}
              {selfHarm.length > 0 && <>Σκέψεις να κάνει κακό στον εαυτό του: {selfHarm.map(formatDate).join(", ")}.</>}
            </p>
          )}
          <div className="row" style={{ gap: 4 }} aria-label="Μέρες που έγραψε">
            {[...days].reverse().map((d) => <span key={d} title={`${formatDate(d)}: ${byDate.has(d) ? "έγραψε" : "δεν έγραψε"}`} className={`dot${byDate.has(d) ? " ok" : ""}`} />)}
          </div>
          <p className="hint" style={{ margin: 0 }}>Οι θεραπευτές βλέπουν μόνο αριθμούς· τις απαντήσεις μέρα-μέρα και τα κείμενα του μέλους τα βλέπει η διαχείριση (απόφαση 13/10).</p>
        </div>
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
          const note = dec(j.note), win = dec(j.win), goalNote = dec(j.goalNote);
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
                {j.goalCheck && <li>Συνεπής με τον στόχο: <strong>{GOAL_CHECK[j.goalCheck as GoalCheck] ?? j.goalCheck}</strong>{goalNote && <> — «{goalNote}»</>}</li>}
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
