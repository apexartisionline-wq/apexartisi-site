import Link from "next/link";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { cyclePicture, cycleReviews, cycleSummaryData, lastFinishedCycle, saveCycleReview } from "@/lib/cycle-review";
import { prisma } from "@/lib/db";
import { formatDate, formatWhen } from "@/lib/time";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const cycle = await lastFinishedCycle(memberId);
  if (!cycle || cycle.id !== String(formData.get("cycleId"))) notFound();
  const t = z.string().trim().min(1).max(1500);
  const goals = t.safeParse(String(formData.get("goals") ?? ""));
  const says = t.safeParse(String(formData.get("memberSays") ?? ""));
  if (!goals.success || !says.success) redirect(`/t/members/${memberId}/cycle?error=1`);
  await saveCycleReview(memberId, cycle.id, user.id, goals.data, says.data);
  await logAccess(user.id, memberId, "cycle_review_save");
  redirect(`/t/members/${memberId}/cycle?saved=1`);
}

// Ανασκόπηση στο τέλος του κύκλου (8 ατομικές + 16 ομάδες): η εικόνα βγαίνει μόνη της,
// ο θεραπευτής γράφει 2 γραμμές. Τη γράφει όποιος θεραπευτής έχει την ατομική.
export default async function CyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "cycle_review_view");
  const [cycle, reviews] = await Promise.all([lastFinishedCycle(id), cycleReviews(id)]);
  const pic = cycle ? await cyclePicture(id, cycle) : null;
  const data = cycle ? await cycleSummaryData(id, cycle) : null;
  const done = cycle ? reviews.find((r) => r.cycleId === cycle.id) : undefined;
  const row = (label: string, value: string, warn = false) => (
    <div className="row spread" style={{ flexWrap: "nowrap" }}><span className="muted">{label}</span><strong style={warn ? { color: "var(--red)" } : undefined}>{value}</strong></div>
  );

  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="month" />
      <h1 style={{ marginBottom: 4 }}>Ανασκόπηση κύκλου</h1>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.error && <div className="error">Γράψε και τις δύο γραμμές.</div>}
      {!pic ? (
        <div className="card muted">Δεν έχει τελειώσει ακόμα κύκλος (8 ατομικές).</div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{formatDate(pic.from)} – {formatDate(pic.to)}</p>
          <div className="card stack">
            {row("Ατομικές", `${pic.sessions.done} από ${pic.sessions.total}${pic.sessions.came < pic.sessions.done ? ` · ήρθε σε ${pic.sessions.came}` : ""}`, pic.sessions.came < pic.sessions.done)}
            {row("Ομάδες", `${pic.groups.came} από ${pic.groups.total}`, pic.groups.came < pic.groups.total / 2)}
            {row("Απογραφές", `${pic.journal.written} από ${pic.journal.days} μέρες`)}
            {row("Κόκκινο κουμπί", String(pic.help), pic.help > 0)}
            {row("Νηφαλιότητα", pic.soberDays !== null ? `${pic.soberDays} μέρες${pic.relapses ? ` · ${pic.relapses} ${pic.relapses === 1 ? "αλλαγή" : "αλλαγές"} ημερομηνίας στον κύκλο` : ""}` : "—", pic.relapses > 0)}
          </div>
          <h2>Στόχοι εβδομάδας</h2>
          {pic.weeks.length === 0 ? <div className="card muted small">Δεν έβαλε στόχους σε αυτόν τον κύκλο.</div> : (
            <div className="list">
              {pic.weeks.map((w) => (
                <div key={w.week} style={{ display: "block" }}>
                  <div className="sub">Εβδομάδα {formatDate(w.week)}</div>
                  <div>«{w.text}»</div>
                  <div className="small muted">Ναι {w.yes} · Λίγο {w.partly} · Όχι {w.no}</div>
                </div>
              ))}
            </div>
          )}
          <h2>Δύο γραμμές</h2>
          {done ? (
            <div className="card">
              <div className="muted small">Πώς πάνε οι στόχοι</div><div className="body-text">{done.goals}</div>
              <div className="muted small" style={{ marginTop: 8 }}>Πώς δούλεψε, τι εικόνα είχε</div><div className="body-text">{done.memberSays}</div>
              <div className="muted small" style={{ marginTop: 8 }}>{done.author} · {formatWhen(done.at)}</div>
            </div>
          ) : (
            <form action={save} className="card">
              <input type="hidden" name="memberId" value={id} />
              <input type="hidden" name="cycleId" value={cycle!.id} />
              <div className="field"><label htmlFor="goals">Πώς πάνε οι στόχοι</label><textarea id="goals" name="goals" required style={{ minHeight: 70 }} /></div>
              <div className="field"><label htmlFor="memberSays">Πώς δούλεψε, τι εικόνα είχε</label><textarea id="memberSays" name="memberSays" required style={{ minHeight: 70 }} /></div>
              <button className="primary" type="submit">Αποθήκευση</button>
            </form>
          )}
        </>
      )}
      {data && (
        <>
          <h2>Δομή σύνοψης κύκλου <span className="muted small" style={{ fontWeight: 400 }}>· προετοιμασία, χωρίς AI</span></h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Μόνο ό,τι υπολογίζεται με σαφείς κανόνες, με την πηγή του δίπλα. Δεν υπάρχει προσχέδιο σύνοψης: τη γράφει άνθρωπος (οι «Δύο γραμμές» πιο πάνω).
            Αν προστεθεί κάποτε βοήθεια από AI, θα χρησιμοποιεί μόνο αυτά τα δεδομένα αυτού του μέλους και αυτής της περιόδου, θα παραπέμπει στις πηγές, θα είναι προσχέδιο προς έλεγχο με ανθρώπινη έγκριση, και δεν θα στέλνει τίποτα στο μέλος.
          </p>
          <details className="card small fold">
            <summary>1. Τι δουλέψαμε <span className="muted">· {data.worked.notes.length} σημειώματα, {data.worked.goals.length} στόχοι, {data.worked.assignments.length} εργασίες</span></summary>
            <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
              {data.worked.notes.map((n) => <li key={n.slotId}><Link href={`/t/s/${n.slotId}`}>{formatDate(n.date)}</Link> · {n.therapist}{n.pair && " · Therapair"}{n.handover.suggested && <> · προτάθηκε: {n.handover.suggested}</>}</li>)}
              {data.worked.goals.map((w) => <li key={w.week}>Στόχος εβδομάδας {formatDate(w.week)}: «{w.text}» (Ναι {w.yes} · Λίγο {w.partly} · Όχι {w.no})</li>)}
              {data.worked.assignments.map((a) => <li key={a.id}>Εργασία{a.step ? ` (Βήμα ${a.step})` : ""}: {a.title} · {a.answered ? "απάντησε" : "δεν απάντησε"}</li>)}
              {data.worked.notes.length + data.worked.goals.length + data.worked.assignments.length === 0 && <li className="muted">Καμία καταγραφή στην περίοδο.</li>}
            </ul>
            <div className="muted">Πηγή: {data.worked.source}.</div>
          </details>
          <details className="card small fold">
            <summary>2. Τι καταγράφηκε ως πρόοδος ή δυσκολία <span className="muted">· από το ημερολόγιο, χωρίς ερμηνεία</span></summary>
            <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
              <li>Μέσοι όροι ({data.participation.journal.written} εγγραφές): διάθεση {data.recorded.mood ?? "—"}/10 · λαχτάρα {data.recorded.craving ?? "—"}/10 · ύπνος {data.recorded.sleep ?? "—"} ώρες</li>
              <li>Νηφαλιότητα: {data.recorded.soberDays !== null ? `${data.recorded.soberDays} μέρες` : "—"}{data.recorded.relapses > 0 && ` · ${data.recorded.relapses} ${data.recorded.relapses === 1 ? "αλλαγή" : "αλλαγές"} ημερομηνίας στον κύκλο`}</li>
              {data.recorded.usedDays.length > 0 && <li>Έγραψε ότι έκανε χρήση: {data.recorded.usedDays.map(formatDate).join(", ")}</li>}
              {data.recorded.selfHarmDays.length > 0 && <li>Σκέψεις να κάνει κακό στον εαυτό του: {data.recorded.selfHarmDays.map(formatDate).join(", ")}</li>}
              {data.recorded.wins.length > 0 && <li>Νίκες: {data.recorded.wins.map((w) => `«${w.text}» (${formatDate(w.date)})`).join(" · ")}</li>}
            </ul>
            <div className="muted">Πηγή: {data.recorded.source}. Οι ελλείψεις (μέρες χωρίς εγγραφή) δεν ερμηνεύονται.</div>
          </details>
          <details className="card small fold">
            <summary>3. Ποια ήταν η συμμετοχή <span className="muted">· με διακριτές πηγές</span></summary>
            <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
              {data.participation.sessions.map((x, i) => <li key={i}>{formatDate(x.date)} · {x.kind}{x.therapist && ` · ${x.therapist}`} · <strong>{x.came ? "ήρθε" : "χωρίς καταγραφή παρουσίας"}</strong> <span className="muted">({x.source})</span>{x.hasNote ? " · σημείωμα ✓" : " · χωρίς σημείωμα"}</li>)}
              <li>Ομάδες: {data.participation.groups.came} από {data.participation.groups.total} <span className="muted">({data.participation.groups.source})</span></li>
              <li>Ημερολόγιο: {data.participation.journal.written} από {data.participation.journal.days} μέρες <span className="muted">({data.participation.journal.source})</span></li>
              <li>Κόκκινο κουμπί: {data.participation.help.count} <span className="muted">({data.participation.help.source})</span></li>
            </ul>
          </details>
          <details className="card small fold">
            <summary>4. Τι χρειάζεται συνέχεια στον επόμενο κύκλο <span className="muted">· όπως γράφτηκε στο τελευταίο σημείωμα</span></summary>
            {data.next.from ? (
              <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                {data.next.from.handover.agreed && <li>Συμφωνήθηκε ως επόμενο βήμα: {data.next.from.handover.agreed}</li>}
                {data.next.from.handover.openIssues && <li>Έμεινε ανοιχτό: {data.next.from.handover.openIssues}</li>}
                {data.next.from.handover.handover && <li>Για τον επόμενο θεραπευτή: {data.next.from.handover.handover}</li>}
                {data.next.from.handover.suggested && <li>Τι προτείναμε: {data.next.from.handover.suggested}</li>}
                <li className="muted">{formatDate(data.next.from.date)} · {data.next.from.therapist}</li>
              </ul>
            ) : <p className="muted">Δεν υπάρχει σημείωμα στον κύκλο.</p>}
            <div className="muted">Πηγή: {data.next.source}.</div>
          </details>
        </>
      )}
      {reviews.filter((r) => r.cycleId !== cycle?.id).length > 0 && (
        <>
          <h2>Προηγούμενοι κύκλοι</h2>
          {reviews.filter((r) => r.cycleId !== cycle?.id).map((r) => (
            <details key={r.id} className="card small">
              <summary>{formatWhen(r.at)} · {r.author}</summary>
              <div><span className="muted">Στόχοι:</span> {r.goals}</div>
              <div><span className="muted">Εικόνα:</span> {r.memberSays}</div>
            </details>
          ))}
        </>
      )}
    </main>
  );
}
