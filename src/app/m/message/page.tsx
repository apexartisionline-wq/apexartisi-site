import { requireMember } from "@/lib/intake";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatDate, localParts } from "@/lib/time";

// Τα μηνύματα του μήνα από την ομάδα (ό,τι έχει ελέγξει και στείλει η υπεύθυνη).
export default async function MemberMessage() {
  const user = await requireMember();
  const msgs = await prisma.monthlyMessage.findMany({ where: { memberId: user.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 12 });
  await prisma.monthlyMessage.updateMany({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, data: { readAt: new Date() } });
  return (
    <main>
      <h1>Από την ομάδα σου</h1>
      {msgs.length === 0 && <div className="card muted">Δεν υπάρχει μήνυμα ακόμα.</div>}
      {msgs.map((m) => (
        <article key={m.id} className="card">
          <div className="muted small">{formatDate(localParts(m.sentAt!).date)}</div>
          <div className="body-text" style={{ fontSize: "1.05rem", lineHeight: 1.55 }}>{dec(m.text)}</div>
        </article>
      ))}
    </main>
  );
}
