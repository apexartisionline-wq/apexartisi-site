import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatDate, localParts } from "@/lib/time";

// Τα μηνύματα του μήνα από την ομάδα (ό,τι έχει ελέγξει και στείλει η υπεύθυνη).
export default async function MemberMessage() {
  // Τα μηνύματα της ομάδας τα βλέπει πάντα (και μετά την ολοκλήρωση συνεργασίας).
  const user = await requireRole("MEMBER");
  const [monthly, closures] = await Promise.all([
    prisma.monthlyMessage.findMany({ where: { memberId: user.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 12 }),
    prisma.closure.findMany({ where: { memberId: user.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 3 }),
  ]);
  const msgs = [...monthly.map((m) => ({ id: m.id, sentAt: m.sentAt!, text: m.text })), ...closures.map((c) => ({ id: c.id, sentAt: c.sentAt!, text: c.message }))].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  await prisma.monthlyMessage.updateMany({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, data: { readAt: new Date() } });
  return (
    <main>
      <h1>Από την ομάδα σου</h1>
      {msgs.length === 0 && <div className="card muted">Δεν υπάρχει μήνυμα ακόμα.</div>}
      {msgs.map((m) => (
        <article key={m.id} className="card">
          <div className="muted small">{formatDate(localParts(m.sentAt).date)}</div>
          <div className="body-text" style={{ fontSize: "1.05rem", lineHeight: 1.55 }}>{dec(m.text)}</div>
        </article>
      ))}
    </main>
  );
}
