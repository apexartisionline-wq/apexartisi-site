import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { autoCloseCycles } from "@/lib/cycle-review";
import { checkDropouts } from "@/lib/dropout";
import { escalatePending, remindCareTasks } from "@/lib/help";
import { sendQueuedPushes } from "@/lib/notify";
import { runSchedule } from "@/lib/schedule";
import { runRetentionDaily } from "@/lib/retention-db";
import { remindOverdueAssessments } from "@/lib/risk-db";

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
    // Εκπρόθεσμη αξιολόγηση αναγκών (απόφαση 14/10): μήνυμα στη διαχείριση, μία φορά την ημέρα ανά μέλος.
    await remindOverdueAssessments().catch((e) => console.error("[risk-overdue]", e));
    // Κύκλοι που ολοκληρώθηκαν: κλείνουν και αρχειοθετούνται μόνοι τους, η διαχείριση παίρνει «Νέος κύκλος» (17/10).
    await autoCloseCycles(undefined, new Date()).catch((e) => console.error("[cycle-auto-close]", e));
  }
  // Χρόνοι τήρησης (έγγραφο 13): αυτόματη εκκαθάριση μία φορά την ημέρα, νωρίς το πρωί (ώρα Ελλάδας ~04:00–05:00).
  if (new Date().getUTCHours() === 1 && new Date().getUTCMinutes() === 17) await runRetentionDaily().catch((e) => console.error("[retention]", e));
  return NextResponse.json({ resent });
}
