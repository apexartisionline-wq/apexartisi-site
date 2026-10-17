import Link from "next/link";
import { CycleArchive } from "@/components/CycleArchive";
import { FolderTabs } from "@/components/FolderTabs";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { enc } from "@/lib/crypto";
import { seesJournalDetail } from "@/lib/access";
import { requireRole } from "@/lib/auth";
import { describeCycleProgress } from "@/lib/cycle-rules";
import { autoCloseCycles, closeCycle, currentCycleProgress, cyclePicture, cycleReviews, cycleSummaryData, lastFinishedCycle } from "@/lib/cycle-review";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/time";

// Κλείσιμο κύκλου (απόφαση 14/10, αυτόματο από 17/10): όταν έχουν γίνει ΚΑΙ οι ατομικές ΚΑΙ οι ομάδες του κύκλου, ο κύκλος
// κλείνει και αρχειοθετείται μόνος του στον φάκελο (στιγμιότυπο της σύνοψης)· η διαχείριση ειδοποιείται για τον νέο κύκλο.
// Ο θεραπευτής μπορεί μετά να προσθέσει «κάτι επιπλέον» (νέα καταχώριση με όνομα και ώρα, τίποτα δεν αλλάζει).
// Η χειροκίνητη φόρμα μένει μόνο ως εφεδρεία, αν το αυτόματο δεν πρόλαβε.
async function close(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const cycle = await lastFinishedCycle(memberId);
  if (!cycle || cycle.id !== String(formData.get("cycleId"))) notFound();
  if (await prisma.cycleReview.findFirst({ where: { cycleId: cycle.id }, select: { id: true } })) redirect(`/t/members/${memberId}/cycle?saved=1`);
  const note = z.string().trim().max(1500).parse(String(formData.get("note") ?? ""));
  await closeCycle(memberId, cycle, user.id, note);
  await logAccess(user.id, memberId, "cycle_review_save");
  redirect(`/t/members/${memberId}/cycle?saved=1`);
}

// «Κάτι επιπλέον» σε κύκλο που έκλεισε αυτόματα: νέα καταχώριση στο αρχείο (δεν αλλάζει το στιγμιότυπο).
async function addNote(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const memberId = String(formData.get("memberId"));
  const cycleId = String(formData.get("cycleId"));
  const note = z.string().trim().min(1).max(1500).parse(String(formData.get("note") ?? ""));
  const c = await prisma.cycle.findFirst({ where: { id: cycleId, memberId }, select: { id: true } });
  if (!c) notFound();
  await prisma.cycleReview.create({ data: { memberId, cycleId, authorId: user.id, goals: enc(""), memberSays: enc(""), note: enc(note) } });
  await logAccess(user.id, memberId, "cycle_review_save");
  redirect(`/t/members/${memberId}/cycle?saved=1`);
}

export default async function CyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true } });
  if (!member) notFound();
  await logAccess(user.id, id, "cycle_review_view");
  await autoCloseCycles([id]).catch((e) => console.error("[cycle-auto-close]", e));
  const [cycle, reviews, current, allCycles] = await Promise.all([lastFinishedCycle(id), cycleReviews(id), currentCycleProgress(id), prisma.cycle.findMany({ where: { memberId: id }, orderBy: { startedAt: "asc" }, select: { id: true } })]);
  const monthNo = (cycleId: string) => allCycles.findIndex((c) => c.id === cycleId) + 1;
  const done = cycle ? reviews.find((r) => r.cycleId === cycle.id) : undefined;
  const [pic, data] = cycle && !done ? await Promise.all([cyclePicture(id, cycle), cycleSummaryData(id, cycle)]) : [null, null];
  const journalDetail = seesJournalDetail(user);
  const archived = reviews.filter((r) => !cycle || r.cycleId !== cycle.id || done);

  return (
    <main>
      <p style={{ margin: "8px 0 0" }}><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <FolderTabs memberId={id} active="month" />
      <h1 style={{ marginBottom: 4 }}>Κλείσιμο κύκλου</h1>
      <p className="muted" style={{ marginTop: 0 }}>Ανοίγει όταν έχουν γίνει και οι ατομικές και οι ομάδες του κύκλου. Τα δεδομένα μαζεύονται μόνα τους· γράφεις κάτι μόνο αν χρειάζεται.</p>
      {sp.saved && <div className="notice">Ο κύκλος κλείστηκε και αρχειοθετήθηκε στον φάκελο ✓</div>}

      {!cycle ? (
        <div className="card">
          <strong>Δεν έχει τελειώσει ακόμα κύκλος</strong>
          <div className="muted small" style={{ marginTop: 4 }}>
            {current ? <>Τρέχων κύκλος (Μήνας {monthNo(current.cycle.id)}): {describeCycleProgress(current.progress)}.</> : "Δεν έχει ξεκινήσει κύκλος."}
            {" "}Χρειάζονται και οι {current?.progress.sessionsTotal ?? 8} ατομικές και οι {current?.progress.groupsTotal ?? 16} ομάδες.
          </div>
        </div>
      ) : done ? (
        <div className="card">
          <strong>Μήνας {monthNo(cycle.id)} — κλείστηκε</strong> <span className="muted small">· {done.author}, {formatWhen(done.at)}</span>
          <div className="muted small" style={{ marginTop: 4 }}>Αρχειοθετημένος στον φάκελο (βλ. παρακάτω).{done.automatic && " Η διαχείριση ενημερώθηκε για τον νέο κύκλο (συμφωνητικό, προεξόφληση)."}</div>
          {!reviews.some((r) => r.cycleId === cycle.id && r.note) && (
            <form action={addNote} style={{ marginTop: 10 }}>
              <input type="hidden" name="memberId" value={id} />
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div className="field">
                <label htmlFor="note">Κάτι επιπλέον για αυτόν τον μήνα; <span className="muted small">(προαιρετικό — μένει στο αρχείο με όνομα και ώρα)</span></label>
                <textarea id="note" name="note" maxLength={1500} style={{ minHeight: 60 }} placeholder="π.χ. τι να έχει στον νου της η ομάδα για τον επόμενο μήνα" />
              </div>
              <button type="submit" className="sm">Προσθήκη στο αρχείο</button>
            </form>
          )}
        </div>
      ) : (
        <>
          <h2 style={{ marginBottom: 4 }}>Μήνας {monthNo(cycle.id)} <span className="muted small" style={{ fontWeight: 400 }}>· {pic!.periodLabel}</span></h2>
          <CycleArchive pic={pic!} data={data!} journalDetail={journalDetail} />
          <form action={close} className="card" style={{ marginTop: 12 }} data-tour="close-cycle">
            <input type="hidden" name="memberId" value={id} />
            <input type="hidden" name="cycleId" value={cycle.id} />
            <div className="field">
              <label htmlFor="note">Κάτι επιπλέον; <span className="muted small">(προαιρετικό — μόνο αν χρειάζεται κάτι που δεν φαίνεται πιο πάνω)</span></label>
              <textarea id="note" name="note" maxLength={1500} style={{ minHeight: 70 }} placeholder="π.χ. τι να έχει στον νου της η ομάδα για τον επόμενο μήνα" />
            </div>
            <button className="primary" type="submit">Κλείσιμο κύκλου και αρχειοθέτηση</button>
            <p className="hint" style={{ margin: "6px 0 0" }}>Κανονικά ο κύκλος κλείνει μόνος του μόλις ολοκληρωθεί· αν το βλέπεις ακόμα εδώ, κλείσε τον. Το στιγμιότυπο της σύνοψης και ό,τι γράψεις μένουν στον φάκελο του μέλους, με όνομα και ώρα.</p>
          </form>
        </>
      )}

      {archived.length > 0 && (
        <>
          <h2>Αρχείο κύκλων</h2>
          {archived.map((r) => (
            <details key={r.id} className="card" open={Boolean(done && r.cycleId === done.cycleId)}>
              <summary><strong>Μήνας {monthNo(r.cycleId) || "—"}</strong> <span className="muted small">· {r.archive ? "κλείστηκε" : "σημείωση"} {formatWhen(r.at)} · {r.author}</span></summary>
              <div style={{ marginTop: 10 }}>
                {r.archive ? (
                  <CycleArchive pic={r.archive.pic} data={r.archive.data} note={r.note} journalDetail={journalDetail} />
                ) : (
                  <div className="stack">
                    {r.goals && <div><span className="muted">Στόχοι:</span> {r.goals}</div>}
                    {r.memberSays && <div><span className="muted">Εικόνα:</span> {r.memberSays}</div>}
                    {r.note && <div><span className="muted">Κάτι επιπλέον:</span> {r.note}</div>}
                    {!r.goals && !r.memberSays && !r.note && <div className="muted">Κλείστηκε χωρίς σημείωση.</div>}
                  </div>
                )}
              </div>
            </details>
          ))}
        </>
      )}
    </main>
  );
}
