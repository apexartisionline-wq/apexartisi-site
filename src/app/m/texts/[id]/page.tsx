import { notFound, redirect, RedirectType } from "next/navigation";
import { PageHead, Panel } from "@/components/ui";
import { withMemberCode } from "@/lib/forms";
import { hasConsent, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { latestAnswers, parseQuestions, saveAnswers } from "@/lib/theme-forms";
import { formatDate, formatWhen } from "@/lib/time";

async function loadPublished(id: string) {
  const s = await getSettings();
  const c = await prisma.content.findUnique({ where: { id }, omit: { image: true } });
  if (!c || !isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, new Date())) return null;
  return c;
}

// Απαντήσεις στη φόρμα της θεματικής μέσα στο Apex (22/10): κάθε αποθήκευση νέα έκδοση· η ομάδα τις βλέπει στον φάκελο.
async function answer(formData: FormData) {
  "use server";
  const user = await requireMember();
  const id = String(formData.get("id") ?? "");
  const c = await loadPublished(id);
  const qs = c ? parseQuestions(c.questions) : [];
  if (!c || c.kind !== "FORM" || qs.length === 0) notFound();
  const answers = qs.map((_, i) => String(formData.get(`a${i}`) ?? ""));
  await saveAnswers(user.id, c.id, answers);
  redirect(`/m/texts/${c.id}?saved=1`, RedirectType.replace);
}

export default async function TextPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireMember();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [c, googleForms] = await Promise.all([loadPublished(id), hasConsent(user.id, "forms")]);
  if (!c) notFound();
  const qs = c.kind === "FORM" ? parseQuestions(c.questions) : [];
  const mine = qs.length ? (await latestAnswers(user.id, [c.id])).get(c.id) : undefined;
  return (
    <main>
      <PageHead title={c.title} sub={`${formatDate(c.date)} · ${c.kind === "DAILY_TEXT" ? "Ξυπνάμε παρέα" : "Φόρμα της θεματικής"}`} />
      {c.imageMime && <img src={`/api/content/${c.id}/image`} alt={c.title} style={{ width: "100%", borderRadius: 12, marginBottom: 12 }} />}
      {c.body && <div className="panel body-text">{c.body}</div>}
      {qs.length > 0 ? (
        <form action={answer} className="panel tform">
          <input type="hidden" name="id" value={c.id} />
          <div className="panel-head"><h2>Οι απαντήσεις μου</h2></div>
          {sp.saved && <div className="notice">Αποθηκεύτηκε ✓ Μπορείς να γυρίσεις και να τις συμπληρώσεις όποτε θέλεις.</div>}
          {qs.map((q, i) => (
            <div key={i} className="field">
              <label htmlFor={`a${i}`}><strong>{i + 1}. {q}</strong></label>
              <textarea id={`a${i}`} name={`a${i}`} maxLength={5000} defaultValue={mine?.answers[i] ?? ""} />
            </div>
          ))}
          {mine && <p className="hint" style={{ margin: "0 0 8px" }}>Τελευταία αποθήκευση {formatWhen(mine.at)}.</p>}
          {/* Ίδια ενημέρωση με το ημερολόγιο: ποιος βλέπει τι γράφεις (διατύπωση προς έγκριση). */}
          <p className="muted small" style={{ margin: "0 0 10px" }}>Ό,τι γράφεις εδώ το βλέπει η ομάδα σου (οι θεραπευτές σου και η διαχείριση), για να το δουλέψετε μαζί. Κανείς άλλος.</p>
          <button className="primary big" type="submit">Αποθήκευση</button>
        </form>
      ) : (
        <>
          {c.url && !googleForms && <Panel><p className="muted small" style={{ margin: 0 }}>Οι φόρμες σε Google δεν είναι ανοιχτές για σένα, γιατί δεν έχεις πει «ναι» γι' αυτές. Μπορείς να δουλέψεις το θέμα στην ατομική σου.</p></Panel>}
          {c.url && googleForms && (
            <p><a className="btn primary" href={withMemberCode(c.url, user.memberCode)} target="_blank" rel="noopener noreferrer">Άνοιξε τη φόρμα</a></p>
          )}
        </>
      )}
    </main>
  );
}
