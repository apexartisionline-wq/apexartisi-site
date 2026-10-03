import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkDropouts } from "@/lib/dropout";
import { escalatePending, remindCareTasks } from "@/lib/help";
import { sendQueuedPushes } from "@/lib/notify";
import { runSchedule } from "@/lib/schedule";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Κάθε λεπτό: κόκκινο κουμπί (κλιμάκωση), ειδοποιήσεις μελών· κάθε μισή ώρα: αποχή και υπενθυμίσεις φροντίδας.
export async function POST(req: Request) {
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const resent = await escalatePending().catch((e) => (console.error("[help]", e), 0));
  await runSchedule().catch((e) => console.error("[schedule]", e));
  await sendQueuedPushes().catch((e) => console.error("[queued-push]", e));
  if (new Date().getUTCMinutes() % 30 === 0) {
    await checkDropouts().catch((e) => console.error("[dropout]", e));
    await remindCareTasks();
  }
  return NextResponse.json({ resent });
}
