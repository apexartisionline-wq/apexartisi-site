import Link from "next/link";
import { notFound } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { GOAL_CHECK, type GoalCheck } from "@/lib/goals";
import { SELF_HARM } from "@/lib/journal-labels";
import { addDays, formatDate, localParts } from "@/lib/time";

const DAYS = 14;
const isDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

// Οι απογραφές (ημερολόγιο ανάκαμψης) ενός μέλους, μέρα-μέρα, με όλες τις απαντήσεις του — για όλη την ομάδα.
export default async function MemberJournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "journal_view");

  const today = localParts(new Date()).date;
  const to = isDate(sp.to) && sp.to! <= today ? sp.to! : today;
  const from = addDays(to, -(DAYS - 1));
  const rows = await prisma.journalEntry.findMany({ where: { memberId: id, date: { gte: from, lte: to } }, orderBy: { date: "desc" } });
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(to, -i));
  const older = addDays(from, -1);
  const newer = addDays(to, DAYS);

  return (
    <main>
      <p className="small"><Link href={`/t/members/${id}`}>← {member.name}</Link></p>
      <h1 style={{ marginBottom: 4 }}>Απογραφές</h1>
      <p className="muted" style={{ marginTop: 0 }}>Ημερολόγιο ανάκαμψης · {formatDate(from)} – {formatDate(to)} · έγραψε {rows.length} από {DAYS} μέρες</p>
      <div className="row" style={{ gap: 6, margin: "8px 0 12px" }}>
        <Link className="btn" href={`/t/members/${id}/journal?to=${older}`}>‹ Παλαιότερες</Link>
        {to < today && <Link className="btn" href={newer >= today ? `/t/members/${id}/journal` : `/t/members/${id}/journal?to=${newer}`}>Νεότερες ›</Link>}
      </div>
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
                <span><b>{String(j.sleepHours).replace(".", ",")}</b> ώρες ύπνος</span>
                <span><b>{j.confidence}</b>/10 σιγουριά για αύριο</span>
              </div>
              <ul className="journal-ans">
                <li>Χρήση: {j.used ? <strong className="warn-text">ναι</strong> : "όχι"}</li>
                <li>Σκέψεις να κάνει κακό στον εαυτό του/της: {j.selfHarm === "YES" || j.selfHarm === "UNSURE" ? <strong className="warn-text">{SELF_HARM[j.selfHarm]}</strong> : SELF_HARM[j.selfHarm]}</li>
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
