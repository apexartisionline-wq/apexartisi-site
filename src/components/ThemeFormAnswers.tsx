import { prisma } from "@/lib/db";
import { latestAnswers, parseQuestions } from "@/lib/theme-forms";
import { formatDate, formatWhen } from "@/lib/time";

/**
 * Οι απαντήσεις του μέλους στις φόρμες της θεματικής μέσα στο Apex (22/10), στον φάκελο («Εργασίες»): ανά φόρμα, νεότερες
 * πάνω, ερώτηση → απάντηση. Περιεχόμενο που έγραψε το μέλος: σε `wm` (υδατογράφημα, χωρίς αντιγραφή — layout /t), όπως οι
 * εργασίες. Ίδια ορατότητα με τα βήματα/εργασίες (όλη η ομάδα και η διαχείριση).
 */
export async function ThemeFormAnswers({ memberId }: { memberId: string }) {
  const latest = await latestAnswers(memberId);
  if (latest.size === 0) return <p className="muted">Δεν έχει απαντήσει ακόμα σε φόρμα της θεματικής μέσα στο Apex.</p>;
  const forms = await prisma.content.findMany({
    where: { id: { in: [...latest.keys()] } },
    select: { id: true, date: true, title: true, questions: true },
    orderBy: { date: "desc" },
  });
  return (
    <div className="stack">
      {forms.map((f) => {
        const a = latest.get(f.id)!;
        const qs = parseQuestions(f.questions);
        return (
          <details key={f.id} className="card" open={forms[0].id === f.id}>
            <summary>
              <strong>{f.title}</strong> <span className="muted small">· {formatDate(f.date)} · απάντησε {formatWhen(a.at)}{a.versions > 1 ? ` · ${a.versions} εκδόσεις` : ""}</span>
            </summary>
            {qs.map((q, i) => (
              <div key={i} style={{ marginTop: 10 }}>
                <div className="small muted">{i + 1}. {q}</div>
                {a.answers[i] ? <div className="body-text wm">{a.answers[i]}</div> : <div className="muted small">δεν απάντησε</div>}
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}
