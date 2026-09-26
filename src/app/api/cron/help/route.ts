import { NextResponse } from "next/server";
import { escalatePending } from "@/lib/help";

// Καλείται κάθε λεπτό από εξωτερικό χρονοπρογραμματιστή (βλ. README) με
// Authorization: Bearer $CRON_SECRET. Ξαναστέλνει ειδοποιήσεις που δεν ανέλαβε κανείς.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  const resent = await escalatePending();
  return NextResponse.json({ resent });
}
