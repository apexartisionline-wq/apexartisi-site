import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notify";

const sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.test) {
    await notifyUsers([user.id], { title: "Δοκιμή: οι ειδοποιήσεις δουλεύουν ✓", url: "/" });
    return NextResponse.json({ ok: true });
  }
  const s = sub.safeParse(body);
  if (!s.success) return new NextResponse(null, { status: 400 });
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.data.endpoint },
    create: { userId: user.id, endpoint: s.data.endpoint, p256dh: s.data.keys.p256dh, auth: s.data.keys.auth },
    update: { userId: user.id, p256dh: s.data.keys.p256dh, auth: s.data.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: String(body.endpoint), userId: user.id } });
  return NextResponse.json({ ok: true });
}
