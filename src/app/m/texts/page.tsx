import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts } from "@/lib/time";

export default async function TextsPage() {
  await requireRole("MEMBER");
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const items = await prisma.content.findMany({
    where: { date: { gte: addDays(today, -21), lte: today } },
    orderBy: [{ date: "desc" }, { kind: "asc" }],
  });
  const visible = items.filter((c) => isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, now));
  return (
    <main>
      <h1>Κείμενα και φόρμες</h1>
      {visible.length === 0 && <p className="muted">Δεν υπάρχει κάτι ακόμα.</p>}
      {visible.map((c) => (
        <div className="card" key={c.id}>
          <span className="muted small">{formatDate(c.date)} · {c.kind === "DAILY_TEXT" ? "Κείμενο της ημέρας" : "Φόρμα"}</span>
          <div><Link href={`/m/texts/${c.id}`}>{c.title}</Link></div>
        </div>
      ))}
    </main>
  );
}
