import "server-only";
import type { PushSubscription } from "@prisma/client";

// Web push: υλοποιείται στο επόμενο βήμα (VAPID). Μέχρι τότε καταγράφεται μόνο.
export async function sendPush(sub: PushSubscription, msg: { title: string; url: string }): Promise<void> {
  console.info(`[push] → ${sub.userId}: ${msg.title}`);
}
