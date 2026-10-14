import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderTabs } from "@/components/FolderTabs";
import { opensJournalDay } from "@/lib/access";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { GOAL_CHECK, type GoalCheck } from "@/lib/goals";
import { SELF_HARM } from "@/lib/journal-labels";
import { addDays, formatDate, formatWhen } from "@/lib/time";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Μία ημερήσια καταχώριση του ημερολογίου ανάκαμψης, ολόκληρη (διευκρίνιση υπεύθυνης 14/10 της απόφασης 13/10):
 * όταν ο θεραπευτής ΑΝΟΙΓΕΙ μια συγκεκριμένη μέρα, βλέπει τις αριθμητικές απαντήσεις, τη σημείωση και τη «νίκη».
 * Οι συνόψεις («Με μια ματιά», λίστα ημερών) μένουν μόνο αριθμοί. Πρόσβαση: θεραπευτική ομάδα και διαχείριση, με
 * υδατογράφημα και χωρίς αντιγραφή (layout /t), και καταγραφή πρόσβασης ανά μέρα. Το μέλος ενημερώνεται πριν την αποθήκευση.
 */
export default async function JournalDayPage({ params }: { params: Promise<{ id: string; date: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id, date } = await params;
  if (!isDate(date) || !opensJournalDay(user)) notFound();
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { name: true } });
  if (!member) notFound();
  const j = await prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: id, date } } });
  await logAccess(user.id, id, `journal_day_view:${date}`);
  const flag = Boolean(j && (j.used || j.selfHarm === "YES" || j.selfHarm === "UNSURE"));
  const note = dec(j?.note), win = dec(j?.win), goalNote = dec(j?.goalNote);
  const back = `/t/members/${id}/journal`;
  return (
    <main>
      <p className="small"><Link className="back" href={back}>‹ Απογραφές · {member.name}</Link></p>
      <FolderTabs memberId={id} active="journal" />
      <h1 style={{ marginBottom: 4 }}>Ημερολόγιο · {formatDate(date)}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href={`/t/members/${id}/journal/${addDays(date, -1)}`}>‹ προηγούμενη μέρα</Link> · <Link href={`/t/members/${id}/journal/${addDays(date, 1)}`}>επόμενη μέρα ›</Link>
      </p>
      {!j ? (
        <div className="empty">Δεν έγραψε ημερολόγιο εκείνη τη μέρα.</div>
      ) : (
        <section className={`card journal-day${flag ? " flag" : ""}`}>
          <div className="row spread"><strong>{formatDate(date)}</strong>{flag && <span className="badge red">να το δεις</span>}</div>
          <div className="journal-nums">
            <span><b>{j.mood}</b>/10 διάθεση</span>
            <span><b>{j.craving}</b>/10 λαχτάρα</span>
            <span><b>{String(j.sleepHours).replace(".", ",")}</b> ώρες ύπνου</span>
            <span><b>{j.confidence}</b>/10 σιγουριά για αύριο</span>
          </div>
          <ul className="journal-ans">
            <li>Χρήση: {j.used ? <strong className="warn-text">ναι</strong> : "όχι"}</li>
            <li>Σκέψεις να κάνει κακό στον εαυτό του: {j.selfHarm === "YES" || j.selfHarm === "UNSURE" ? <strong className="warn-text">{SELF_HARM[j.selfHarm]}</strong> : SELF_HARM[j.selfHarm]}</li>
            {j.goalCheck && <li>Συνεπής με τον στόχο: <strong>{GOAL_CHECK[j.goalCheck as GoalCheck] ?? j.goalCheck}</strong>{goalNote && <span className="wm"> — «{goalNote}»</span>}</li>}
            <li>Μια νίκη σήμερα: {win ? <span className="wm">«{win}»</span> : <span className="muted">δεν έγραψε</span>}</li>
          </ul>
          <div className="small muted" style={{ marginTop: 8 }}>Κάτι που θέλει να γράψει:</div>
          {note ? <div className="body-text journal-note wm">{note}</div> : <div className="muted">δεν έγραψε</div>}
          <p className="hint" style={{ margin: "10px 0 0" }}>Γράφτηκε {formatWhen(j.updatedAt)}. Το μέλος ξέρει ότι ολόκληρη η καταχώριση μπορεί να τη δει η ομάδα του. Η προβολή καταγράφεται.</p>
        </section>
      )}
    </main>
  );
}
