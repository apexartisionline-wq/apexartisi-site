import "server-only";
import type { PushSubscription } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "./db";

// Web push με κλειδιά VAPID. Τα κείμενα είναι πάντα ουδέτερα (φαίνονται στην οθόνη κλειδώματος).
let ready: boolean | null = null;
function setup(): boolean {
  if (ready !== null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (ready = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return (ready = true);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

export async function sendPush(
  sub: PushSubscription,
  msg: { title: string; body?: string; url: string; tag?: string; urgent?: boolean },
): Promise<void> {
  if (!setup()) {
    console.info(`[push] (χωρίς VAPID) → ${sub.userId}: ${msg.title}`);
    return;
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: msg.urgent ? 600 : 6 * 3600, urgency: msg.urgent ? "high" : "normal" },
    );
  } catch (e: any) {
    // Η συσκευή δεν δέχεται πια ειδοποιήσεις.
    if (e?.statusCode === 404 || e?.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    else console.error("[push]", e?.statusCode, e?.body);
  }
}
