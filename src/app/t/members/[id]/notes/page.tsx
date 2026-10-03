import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteTags } from "@/components/NoteTags";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchNote, type NoteFilter } from "@/lib/handover-rules";
import { memberNotes } from "@/lib/member-notes";
import { formatDate, formatHour } from "@/lib/time";

type Search = { t?: string; from?: string; to?: string; q?: string; risk?: string; used?: string };
const isDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

// Όλα τα σημειώματα ενός μέλους, από όλους τους θεραπευτές, με φίλτρα.
export default async function MemberNotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "notes_view");

  const rows = await memberNotes(id);
  const filter: NoteFilter = {
    therapistId: sp.t || undefined,
    from: isDate(sp.from),
    to: isDate(sp.to),
    q: sp.q?.slice(0, 100) || undefined,
    risk: sp.risk === "1",
    used: sp.used === "1",
  };
  const notes = rows.filter((n) => matchNote({ therapistId: n.therapistId, date: n.date, text: `${n.text}\n${n.next}`, riskChange: n.riskChange, usedSince: n.usedSince }, filter));
  const therapists = [...new Map(rows.map((n) => [n.therapistId, n.therapist])).entries()];

  return (
    <main>
      <p className="small"><Link href={`/t/members/${id}`}>← {member.name}</Link></p>
      <h1>Σημειώματα</h1>
      <form className="card small" method="get">
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <select name="t" defaultValue={sp.t ?? ""} aria-label="Θεραπευτής">
            <option value="">Όλοι οι θεραπευτές</option>
            {therapists.map(([tid, name]) => <option key={tid} value={tid}>{name}</option>)}
          </select>
          <label>Από <input type="date" name="from" defaultValue={filter.from} /></label>
          <label>Έως <input type="date" name="to" defaultValue={filter.to} /></label>
          <input name="q" defaultValue={filter.q} placeholder="Λέξη (π.χ. οικογένεια)" aria-label="Αναζήτηση" />
        </div>
        <div className="row" style={{ gap: 16, marginTop: 8 }}>
          <label><input type="checkbox" name="risk" value="1" defaultChecked={filter.risk} style={{ width: "auto" }} /> Μόνο αύξηση αναγκών ασφάλειας</label>
          <label><input type="checkbox" name="used" value="1" defaultChecked={filter.used} style={{ width: "auto" }} /> Μόνο χρήση</label>
          <button type="submit">Φίλτρο</button>
          <Link href={`/t/members/${id}/notes`}>Καθαρισμός</Link>
        </div>
      </form>
      <p className="muted small">{notes.length} από {rows.length} σημειώματα</p>
      {notes.map((n) => (
        <div className="card" key={n.id}>
          <div className="small">
            <Link href={`/t/s/${n.slotId}`}><strong>{formatDate(n.date)} {formatHour(n.hour)}</strong></Link>
            {" · "}{n.therapist}{n.pair && " · Therapair"}
          </div>
          <div className="body-text" style={{ marginTop: 8 }}>{n.text}</div>
          <NoteTags riskChange={n.riskChange} usedSince={n.usedSince} nextStep={n.next} text={n.text} />
        </div>
      ))}
    </main>
  );
}
