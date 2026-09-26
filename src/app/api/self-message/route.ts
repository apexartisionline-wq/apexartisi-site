import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_BYTES = 8 * 1024 * 1024;

// Το «μήνυμα από τον εαυτό σου»: το ακούει μόνο το ίδιο το μέλος.
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return new NextResponse(null, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { selfMessage: true, selfMessageType: true } });
  if (!row?.selfMessage) return new NextResponse(null, { status: 404 });
  return new NextResponse(row.selfMessage, {
    headers: { "content-type": row.selfMessageType ?? "audio/webm", "cache-control": "private, no-store" },
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = (req.headers.get("content-type") ?? "").split(";")[0];
  if (!type.startsWith("audio/")) return NextResponse.json({ error: "Μόνο ήχος." }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: "Πολύ μεγάλο αρχείο." }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { selfMessage: buf, selfMessageType: type } });
  return NextResponse.json({ ok: true });
}
