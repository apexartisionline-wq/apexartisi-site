import { EmptyState, PageHead, Panel } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatDate, localParts } from "@/lib/time";
import { teamMessagesFor } from "@/lib/team-messages";

// Τα μηνύματα του μήνα από την ομάδα (ό,τι έχει ελέγξει και στείλει η υπεύθυνη).
export default async function MemberMessage() {
  // Τα μηνύματα της ομάδας τα βλέπει πάντα (και μετά την ολοκλήρωση συνεργασίας).
  const user = await requireRole("MEMBER");
  const [monthly, closures, team] = await Promise.all([
    prisma.monthlyMessage.findMany({ where: { memberId: user.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 12 }),
    prisma.closure.findMany({ where: { memberId: user.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 3 }),
    // Μηνύματα της διαχείρισης και ολοκλήρωση κύκλου (22/10)· ήδη αποκρυπτογραφημένα.
    teamMessagesFor(user.id),
  ]);
  const msgs = [
    ...monthly.map((m) => ({ id: m.id, sentAt: m.sentAt!, text: dec(m.text) })),
    ...closures.map((c) => ({ id: c.id, sentAt: c.sentAt!, text: dec(c.message) })),
    ...team.map((t) => ({ id: t.id, sentAt: t.createdAt, text: t.text })),
  ].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  await prisma.monthlyMessage.updateMany({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, data: { readAt: new Date() } });
  await prisma.closure.updateMany({ where: { memberId: user.id, sentAt: { not: null }, readAt: null }, data: { readAt: new Date() } });
  await prisma.teamMessage.updateMany({ where: { memberId: user.id, readAt: null }, data: { readAt: new Date() } });
  return (
    <main>
      <PageHead title="Από την ομάδα σου" sub="Τα μηνύματα που σου έστειλε η ομάδα" />
      {msgs.length === 0 && <Panel><EmptyState>Δεν υπάρχει μήνυμα ακόμα.</EmptyState></Panel>}
      {msgs.map((m) => (
        <Panel key={m.id}>
          <div className="hint" style={{ marginBottom: 6 }}>{formatDate(localParts(m.sentAt).date)}</div>
          <div className="body-text" style={{ fontSize: "1.05rem", lineHeight: 1.55 }}>{m.text}</div>
        </Panel>
      ))}
    </main>
  );
}
