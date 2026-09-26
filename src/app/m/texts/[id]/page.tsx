import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

export default async function TextPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("MEMBER");
  const { id } = await params;
  const [s, c] = await Promise.all([getSettings(), prisma.content.findUnique({ where: { id } })]);
  if (!c || !isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, new Date())) notFound();
  return (
    <main>
      <p className="muted">{formatDate(c.date)}</p>
      <h1>{c.title}</h1>
      {c.body && <div className="card body-text">{c.body}</div>}
      {c.url && (
        <p><a className="btn primary" href={c.url} target="_blank" rel="noopener noreferrer">Άνοιξε τη φόρμα</a></p>
      )}
    </main>
  );
}
