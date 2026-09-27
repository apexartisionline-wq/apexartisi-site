import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { escalatePending, remindCareTasks } from "@/lib/help";
import { runSchedule } from "@/lib/schedule";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Κάθε λεπτό: κόκκινο κουμπί (κλιμάκωση), ειδοποιήσεις μελών, υπενθυμίσεις φροντίδας.
export async function POST(req: Request) {
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const resent = await escalatePending();
  await runSchedule().catch((e) => console.error("[schedule]", e));
  if (new Date().getUTCMinutes() % 30 === 0) await remindCareTasks();
  return NextResponse.json({ resent });
}
