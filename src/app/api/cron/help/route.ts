import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { escalatePending, remindCareTasks } from "@/lib/help";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Καλείται κάθε λεπτό από εξωτερικό χρονοπρογραμματιστή (βλ. README).
export async function POST(req: Request) {
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const resent = await escalatePending();
  const minute = new Date().getUTCMinutes();
  if (minute % 30 === 0) await remindCareTasks();
  return NextResponse.json({ resent });
}
