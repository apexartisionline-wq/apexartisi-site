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

/** Καλείται από το cron: στέλνει όσες ειδοποιήσεις περίμεναν. */
export async function sendQueuedPushes(now = new Date()): Promise<void> {
  const due = await prisma.queuedPush.findMany({ where: { sentAt: null, sendAt: { lte: now } }, take: 200 });
  for (const q of due) {
    const done = await prisma.queuedPush.updateMany({ where: { id: q.id, sentAt: null }, data: { sentAt: now } });
    if (done.count) await notifyUsers([q.userId], q.msg as PushMessage);
  }
}

/** Ειδοποίηση σε όλους τους ενεργούς χρήστες ενός ρόλου. */
export async function notifyRole(role: Role, msg: PushMessage): Promise<void> {
  const users = await prisma.user.findMany({ where: { role, active: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg);
}
