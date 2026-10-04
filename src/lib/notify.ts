import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { sendPush } from "./push";
import { quietUntil } from "./quiet";

export type PushMessage = { title: string; body?: string; url: string; tag?: string; urgent?: boolean };

/** Ειδοποίηση push σε συγκεκριμένους χρήστες (αν έχουν ενεργοποιήσει ειδοποιήσεις). */
export async function notifyUsers(userIds: string[], msg: PushMessage): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  await Promise.allSettled(subs.map((sub) => sendPush(sub, msg)));
}

/** Ειδοποίηση προς μέλη (όχι επείγουσα): μέσα στις ήσυχες ώρες περιμένει ως τις 08:00. */
export async function notifyMembers(userIds: string[], msg: PushMessage, now = new Date()): Promise<void> {
  const until = quietUntil(now);
  if (!until) return notifyUsers(userIds, msg);
  if (userIds.length) await prisma.queuedPush.createMany({ data: userIds.map((userId) => ({ userId, msg, sendAt: until })) });
}

async function unreadTeamMessage(memberId: string): Promise<boolean> {
  const where = { memberId, sentAt: { not: null }, readAt: null };
  return Boolean((await prisma.monthlyMessage.findFirst({ where, select: { id: true } })) ?? (await prisma.closure.findFirst({ where, select: { id: true } })));
}

/** Καλείται από το cron: στέλνει όσες ειδοποιήσεις περίμεναν. */
export async function sendQueuedPushes(now = new Date()): Promise<void> {
  const due = await prisma.queuedPush.findMany({ where: { sentAt: null, sendAt: { lte: now } }, take: 200 });
  for (const q of due) {
    const done = await prisma.queuedPush.updateMany({ where: { id: q.id, sentAt: null }, data: { sentAt: now } });
    if (!done.count) continue;
    const msg = q.msg as PushMessage;
    // Αν το μέλος έχει ήδη διαβάσει το μήνυμα μέσα στην εφαρμογή, δεν χρειάζεται ειδοποίηση το πρωί.
    if (msg.url === "/m/message" && !(await unreadTeamMessage(q.userId))) continue;
    // Μήνυμα της ομάδας που διαβάστηκε ήδη μέσα στην εφαρμογή: όχι ειδοποίηση το πρωί.
    if (msg.url.startsWith("/t/messages") && !(await prisma.staffMessage.findFirst({ where: { toId: q.userId, readAt: null }, select: { id: true } }))) continue;
    await notifyUsers([q.userId], msg);
  }
}

/** Ειδοποίηση σε όλους τους ενεργούς χρήστες ενός ρόλου. */
export async function notifyRole(role: Role, msg: PushMessage): Promise<void> {
  const users = await prisma.user.findMany({ where: { role, active: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg);
}
