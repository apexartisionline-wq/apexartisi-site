import "server-only";
import { prisma } from "./db";

/** Πόσα αδιάβαστα μηνύματα της ομάδας έχει κάποιος, και από ποιους. */
export async function unreadStaffMessages(userId: string) {
  const rows = await prisma.staffMessage.groupBy({ by: ["fromId"], where: { toId: userId, readAt: null }, _count: { _all: true } });
  if (!rows.length) return { total: 0, from: [] as { id: string; name: string; count: number }[] };
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.fromId) } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return {
    total: rows.reduce((t, r) => t + r._count._all, 0),
    from: rows.map((r) => ({ id: r.fromId, name: name.get(r.fromId) ?? "", count: r._count._all })),
  };
}
