import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { claim } from "@/lib/help";
import { answerCallback } from "@/lib/telegram";

function validSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Webhook του bot: «Το αναλαμβάνω». Μόνο μέλη της ομάδας με δηλωμένο Telegram ID.
export async function POST(req: Request) {
  if (!validSecret(req)) return new NextResponse(null, { status: 401 });
  const update = await req.json().catch(() => null);
  const cb = update?.callback_query;
  if (!cb || typeof cb.data !== "string" || !cb.data.startsWith("claim:")) return NextResponse.json({ ok: true });
  const therapist = await prisma.user.findFirst({
    where: { telegramUserId: String(cb.from?.id), active: true, role: { in: ["THERAPIST", "ADMIN"] } },
  });
  if (!therapist) {
    await answerCallback(cb.id, "Ο λογαριασμός σου δεν είναι δηλωμένος στην ομάδα (Telegram ID).");
    return NextResponse.json({ ok: true });
  }
  const res = await claim(cb.data.slice("claim:".length), therapist.id);
  await answerCallback(cb.id, res.ok ? "Το ανέλαβες. Πάρε τηλέφωνο τώρα και δήλωσε «μιλήσαμε» στο app." : `Το έχει ήδη ο/η ${res.claimedBy ?? "—"}.`);
  return NextResponse.json({ ok: true });
}
