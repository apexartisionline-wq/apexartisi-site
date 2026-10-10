import { notFound } from "next/navigation";
import { withMemberCode } from "@/lib/forms";
import { hasConsent, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

export default async function TextPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const [s, c, forms] = await Promise.all([getSettings(), prisma.content.findUnique({ where: { id } }), hasConsent(user.id, "forms")]);
  if (!c || !isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, new Date())) notFound();
  return (
    <main>
      <p className="muted">{formatDate(c.date)}</p>
      <h1>{c.title}</h1>
      {c.body && <div className="card body-text">{c.body}</div>}
      {c.url && !forms && <p className="muted small">Οι φόρμες δεν είναι ανοιχτές για σένα, γιατί δεν έχεις πει «ναι» γι' αυτές. Μπορείς να δουλέψεις το θέμα στην ατομική σου.</p>}
      {c.url && forms && (
        <p><a className="btn primary" href={withMemberCode(c.url, user.memberCode)} target="_blank" rel="noopener noreferrer">Άνοιξε τη φόρμα</a></p>
      )}
    </main>
  );
}
