import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { encryptBytes } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { cleanPhoto, PHOTO_MAX_BYTES, PHOTOS_PER_ASSIGNMENT } from "@/lib/library";

// Το μέλος ανεβάζει φωτογραφία της εργασίας του (π.χ. γραμμένη στο χαρτί).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/m/library/a/${id}?${q}`, req.url), 303);
  const a = await prisma.assignment.findFirst({ where: { id, memberId: user.id }, include: { _count: { select: { photos: true } } } });
  if (!a) return new NextResponse(null, { status: 404 });

  const files = (await req.formData()).getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return back("e=empty");
  if (a._count.photos + files.length > PHOTOS_PER_ASSIGNMENT) return back("e=many");
  const clean: Buffer[] = [];
  for (const f of files) {
    if (!f.type.startsWith("image/") || f.size > PHOTO_MAX_BYTES) return back("e=type");
    try {
      clean.push(await cleanPhoto(Buffer.from(await f.arrayBuffer())));
    } catch {
      return back("e=type");
    }
  }
  await prisma.$transaction([
    ...clean.map((b) => prisma.assignmentPhoto.create({ data: { assignmentId: id, data: new Uint8Array(encryptBytes(b)) } })),
    prisma.assignment.update({ where: { id }, data: { answeredAt: new Date() } }),
  ]);
  return back("ok=1");
}
