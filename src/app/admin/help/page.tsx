import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { telegramConfigured } from "@/lib/telegram";

async function resolve(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.helpRequest.update({ where: { id: String(formData.get("id")) }, data: { resolvedAt: new Date() } });
  redirect("/admin/help");
}

const fmt = (d: Date) => d.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });

export default async function HelpLog() {
  const items = await prisma.helpRequest.findMany({
    include: { member: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <h1>Κόκκινο κουμπί</h1>
      {!telegramConfigured() && (
        <div className="error">
          Το Telegram δεν έχει ρυθμιστεί (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Μέχρι τότε το μέλος βλέπει αμέσως τη γραμμή βοήθειας και το 112.
        </div>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Πότε</th><th>Μέλος</th><th>Ειδοποιήσεις</th><th>Ανέλαβε</th><th>Σε</th><th></th></tr></thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id}>
                <td>{fmt(h.createdAt)}</td>
                <td>{h.member.name}</td>
                <td>{h.notifyCount}</td>
                <td>{h.claimedByName ?? <span className="badge red">κανείς</span>}</td>
                <td>{h.claimedAt ? `${Math.max(0, Math.round((h.claimedAt.getTime() - h.createdAt.getTime()) / 60_000))}′` : ""}</td>
                <td>
                  {h.resolvedAt ? <span className="badge ok">έκλεισε</span> : (
                    <form action={resolve}>
                      <input type="hidden" name="id" value={h.id} />
                      <button type="submit" style={{ padding: "6px 10px" }}>Κλείσιμο</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="muted">Κανένα.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
