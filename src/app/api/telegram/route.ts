import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { answerCallback, markClaimed } from "@/lib/telegram";

function validSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Webhook του bot: χειρίζεται το «Το αναλαμβάνω». Απαντά όποιος το δει πρώτος.
export async function POST(req: Request) {
  if (!validSecret(req)) return new NextResponse(null, { status: 401 });
  const update = await req.json().catch(() => null);
  const cb = update?.callback_query;
  if (!cb || typeof cb.data !== "string" || !cb.data.startsWith("claim:")) return NextResponse.json({ ok: true });

  const requestId = cb.data.slice("claim:".length);
  const therapist = await prisma.user.findUnique({ where: { telegramUserId: String(cb.from.id) } });
  const claimerName = therapist?.name ?? [cb.from.first_name, cb.from.last_name].filter(Boolean).join(" ");

  // Μόνο ο πρώτος παίρνει το αίτημα.
  const claimed = await prisma.helpRequest.updateMany({
    where: { id: requestId, claimedAt: null },
    data: { claimedAt: new Date(), claimedByName: claimerName, claimedById: therapist?.id ?? null },
  });
  const help = await prisma.helpRequest.findUnique({ where: { id: requestId }, include: { member: { select: { name: true } } } });
  if (!help) {
    await answerCallback(cb.id, "Δεν βρέθηκε.");
    return NextResponse.json({ ok: true });
  }
  if (claimed.count === 0) {
    await answerCallback(cb.id, `Το έχει ήδη ο/η ${help.claimedByName}.`);
    return NextResponse.json({ ok: true });
  }
  await markClaimed(help.telegramMessageIds as number[], help.member.name, claimerName);
  await answerCallback(cb.id, "Το ανέλαβες. Πάρε τηλέφωνο τώρα.");
  return NextResponse.json({ ok: true });
}
