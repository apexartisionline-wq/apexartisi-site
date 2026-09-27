import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { sendPush } from "./push";

export type PushMessage = { title: string; body?: string; url: string; tag?: string; urgent?: boolean };

/** Ειδοποίηση push σε συγκεκριμένους χρήστες (αν έχουν ενεργοποιήσει ειδοποιήσεις). */
export async function notifyUsers(userIds: string[], msg: PushMessage): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  await Promise.allSettled(subs.map((sub) => sendPush(sub, msg)));
}

/** Ειδοποίηση σε όλους τους ενεργούς χρήστες ενός ρόλου. */
export async function notifyRole(role: Role, msg: PushMessage): Promise<void> {
  const users = await prisma.user.findMany({ where: { role, active: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg);
}
