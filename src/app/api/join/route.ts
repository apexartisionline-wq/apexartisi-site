import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// «Σύνδεση» του θεραπευτή: καταγράφει την ώρα που μπήκε (το Zoom το ανοίγει ο browser).
const body = z.object({ kind: z.enum(["SLOT", "GROUP"]), ref: z.string().min(1).max(40) });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role === "MEMBER") return new NextResponse(null, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { kind, ref } = parsed.data;
  if (kind === "SLOT") {
    const slot = await prisma.slot.findUnique({ where: { id: ref }, select: { therapistId: true } });
    if (!slot || (slot.therapistId !== user.id && user.role !== "ADMIN")) return new NextResponse(null, { status: 403 });
  } else if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(ref)) {
    return new NextResponse(null, { status: 400 });
  }
  await prisma.staffJoin.create({ data: { userId: user.id, kind, ref } });
  return new NextResponse(null, { status: 204 });
}
