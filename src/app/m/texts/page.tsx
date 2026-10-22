import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHead, Panel, Pill } from "@/components/ui";
import { latestAnswers, parseQuestions } from "@/lib/theme-forms";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts, mondayOf } from "@/lib/time";

// «Βιβλιοθήκη θεματικών» (υπεύθυνη 22/10: «όχι κείμενα — βιβλιοθήκη θεματικών· εκεί μέσα οι άνθρωποι βλέπουν τις θεματικές»).
// Μία ενότητα ανά εβδομάδα (Δευτέρα–Κυριακή, όπως η θεματική της ομάδας) με τις φόρμες της. Ό,τι έχει βγει από την έναρξη
// του μέλους (ή τον τελευταίο χρόνο), νεότερα πάνω. Τα κείμενα της ημέρας («Ξεκινάμε τη μέρα παρέα») ΔΕΝ μπαίνουν εδώ
// (υπεύθυνη 22/10: «δεν έχει θέση στη βιβλιοθήκη θεματικών, δεν τις κρατάνε τις κάρτες») — μόνο στο «Σήμερα» της μέρας τους.
// Φόρμες μέσα στο Apex (22/10): το μέλος απαντά και ξαναβλέπει τις απαντήσεις του· οι παλιές με σύνδεσμο (Google) μένουν σύνδεσμοι.
export default async function ThemesLibraryPage() {
  const user = await requireMember();
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const from = user.programStartDate && user.programStartDate > addDays(today, -365) ? addDays(mondayOf(user.programStartDate), -7) : addDays(today, -365);
  const items = await prisma.content.findMany({
    where: { kind: "FORM", date: { gte: from, lte: today } },
    orderBy: [{ date: "desc" }, { title: "asc" }],
    select: { id: true, date: true, kind: true, title: true, questions: true },
  });
  const forms = items.filter((c) => isPublished(c.date, s.formsTime, now));
  const weeks = new Map<string, typeof forms>();
  for (const f of forms) {
    const w = mondayOf(f.date);
    weeks.set(w, [...(weeks.get(w) ?? []), f]);
  }
  const thisWeek = mondayOf(today);
  const mine = await latestAnswers(user.id, forms.filter((f) => parseQuestions(f.questions).length).map((f) => f.id));
  return (
    <main>
      <PageHead title="Βιβλιοθήκη θεματικών" sub="Οι θεματικές που δουλεύουμε κάθε εβδομάδα" />
      {weeks.size === 0 && <Panel><EmptyState>Δεν υπάρχει κάτι ακόμα.</EmptyState></Panel>}
      {[...weeks.entries()].map(([w, fs]) => {
        const sorted = [...fs].sort((a, b) => a.date.localeCompare(b.date));
        return (
          <details key={w} className="panel m-theme" open={w === thisWeek}>
            <summary>
              <span className="iconbox"><Icon name="list" size={20} /></span>
              <span className="grow">
                <strong>{w === thisWeek ? "Αυτή την εβδομάδα" : `Εβδομάδα ${formatDate(w)}`}</strong>
                <div className="hint">{sorted.map((f) => f.title).join(" · ")}</div>
              </span>
            </summary>
            {sorted.map((f, i) => (
              <Link key={f.id} href={`/m/texts/${f.id}`} className="linkrow">
                <span className="iconbox">{i + 1}</span>
                <span className="grow">
                  <div style={{ fontWeight: 600 }}>{f.title}</div>
                  <div className="hint">Φόρμα {i + 1} · {formatDate(f.date)}</div>
                  {parseQuestions(f.questions).length > 0 && (
                    <div style={{ marginTop: 4 }}>{mine.has(f.id) ? <Pill tone="ok" icon="check">Απάντησες</Pill> : <Pill tone="grey">Να την απαντήσεις</Pill>}</div>
                  )}
                </span>
                <span className="arrow"><Icon name="chevron" /></span>
              </Link>
            ))}
          </details>
        );
      })}
    </main>
  );
}
