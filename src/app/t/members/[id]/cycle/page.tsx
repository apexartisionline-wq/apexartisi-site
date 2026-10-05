import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { cyclePicture, cycleReviews, lastFinishedCycle, saveCycleReview } from "@/lib/cycle-review";
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
  const done = cycle ? reviews.find((r) => r.cycleId === cycle.id) : undefined;
  const row = (label: string, value: string, warn = false) => (
    <div className="row spread" style={{ flexWrap: "nowrap" }}><span className="muted">{label}</span><strong style={warn ? { color: "var(--red)" } : undefined}>{value}</strong></div>
  );

  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
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
            {row("Νηφαλιότητα", pic.soberDays !== null ? `${pic.soberDays} μέρες${pic.relapses ? ` · ${pic.relapses} αλλαγή ημερομηνίας στον κύκλο` : ""}` : "—", pic.relapses > 0)}
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
