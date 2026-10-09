import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

// Ένα κείμενο της ημέρας ή μια φόρμα της θεματικής, όπως τη βλέπει το μέλος.
export default async function TherapistContent({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const [s, c] = await Promise.all([getSettings(), prisma.content.findUnique({ where: { id } })]);
  if (!c) notFound();
  const out = isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, new Date());
  return (
    <main>
      <p className="small"><Link className="back" href="/t/material">‹ Υλικό</Link></p>
      <p className="muted">
        {formatDate(c.date)} · {c.kind === "DAILY_TEXT" ? "Κείμενο της ημέρας" : "Φόρμα της θεματικής"}
        {!out && <> · <strong>δεν έχει βγει ακόμα στα μέλη</strong></>}
      </p>
      <h1>{c.title}</h1>
      {c.body && <div className="card body-text">{c.body}</div>}
      {c.url && (
        <>
          <p><a className="btn primary" href={c.url} target="_blank" rel="noopener noreferrer">Άνοιξε τη φόρμα</a></p>
          <p className="small muted">Ανοίγει για να τη δεις. Το μέλος τη συμπληρώνει από το δικό του «Κείμενα», με τον κωδικό του.</p>
        </>
      )}
      {!c.body && !c.url && <p className="muted">Μόνο τίτλος, χωρίς κείμενο.</p>}
    </main>
  );
}
