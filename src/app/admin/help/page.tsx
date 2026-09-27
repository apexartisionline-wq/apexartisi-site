import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requestHuman } from "@/lib/help";
import { telegramConfigured } from "@/lib/telegram";

async function drill() {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = await requestHuman(admin.id, true);
  redirect(`/admin/help?drill=${id}`);
}

const fmt = (d: Date) => d.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });
const mins = (a: Date, b: Date | null) => (b ? `${Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000))}′` : "—");

export default async function HelpLog({ searchParams }: { searchParams: Promise<{ drill?: string }> }) {
  const sp = await searchParams;
  const items = await prisma.helpRequest.findMany({ include: { member: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const opens = await prisma.helpOpen.count({ where: { openedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  return (
    <>
      <h1>Κόκκινο κουμπί</h1>
      {!telegramConfigured() && (
        <div className="error">Το Telegram δεν έχει ρυθμιστεί (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Το μέλος βλέπει αμέσως γραμμές βοήθειας και 112.</div>
      )}
      <div className="row">
        <form action={drill}><button type="submit">🧪 Εβδομαδιαία δοκιμή τώρα</button></form>
        <Link className="btn" href="/admin/oncall">Εφημερίες</Link>
        <span className="muted small">Ανοίγματα κουμπιού τις τελευταίες 30 μέρες: {opens}</span>
      </div>
      {sp.drill && <div className="notice">Στάλθηκε δοκιμαστική ειδοποίηση. Όποιος τη δει πατά «Το αναλαμβάνω»· ο χρόνος καταγράφεται.</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Πότε</th><th>Μέλος</th><th>Ειδοπ.</th><th>Ανέλαβε</th><th>Σε</th><th>Μίλησαν σε</th><th>Έκβαση</th></tr></thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id}>
                <td>{fmt(h.createdAt)}</td>
                <td>{h.isDrill ? <span className="badge">δοκιμή</span> : <Link href={`/t/help/${h.id}`}>{h.member.name}</Link>}</td>
                <td>{h.notifyCount}{h.deliveryFailedAt && " ⚠"}</td>
                <td>{h.claimedByName ?? <span className="badge red">κανείς</span>}</td>
                <td>{mins(h.createdAt, h.claimedAt)}</td>
                <td>{mins(h.createdAt, h.talkedAt)}</td>
                <td className="small">{h.outcome}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="muted">Κανένα.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
