import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHead, Panel } from "@/components/ui";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts } from "@/lib/time";

export default async function TextsPage() {
  await requireMember();
  const s = await getSettings();
  const now = new Date();
  const today = localParts(now).date;
  const items = await prisma.content.findMany({
    omit: { image: true },
    where: { date: { gte: addDays(today, -21), lte: today } },
    orderBy: [{ date: "desc" }, { kind: "asc" }],
  });
  const visible = items.filter((c) => isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, now));
  return (
    <main>
      <PageHead title="Κείμενα" sub="Τα κείμενα της ημέρας και οι φόρμες των τελευταίων εβδομάδων" />
      <Panel>
        {visible.length === 0 && <EmptyState>Δεν υπάρχει κάτι ακόμα.</EmptyState>}
        {visible.map((c) => (
          <Link key={c.id} href={`/m/texts/${c.id}`} className="linkrow">
            <span className="iconbox"><Icon name={c.kind === "DAILY_TEXT" ? "doc" : "list"} size={20} /></span>
            <span className="grow">
              <div style={{ fontWeight: 600 }}>{c.title}</div>
              <div className="hint">{formatDate(c.date)} · {c.kind === "DAILY_TEXT" ? "Κείμενο της ημέρας" : "Φόρμα"}</div>
            </span>
            <span className="arrow"><Icon name="chevron" /></span>
          </Link>
        ))}
      </Panel>
    </main>
  );
}
