import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { decryptBytes } from "@/lib/crypto";
import { prisma } from "@/lib/db";

// Φωτογραφία εργασίας: τη βλέπει το ίδιο το μέλος και οι θεραπευτές (με καταγραφή πρόσβασης).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const photo = await prisma.assignmentPhoto.findUnique({ where: { id }, include: { assignment: { select: { memberId: true } } } });
  if (!photo) return new NextResponse(null, { status: 404 });
  const memberId = photo.assignment.memberId;
  if (user.role === "MEMBER" && user.id !== memberId) return new NextResponse(null, { status: 404 });
  if (user.role !== "MEMBER") await logAccess(user.id, memberId, "assignment_photo_view");
  return new NextResponse(new Uint8Array(decryptBytes(Buffer.from(photo.data))), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
  });
}
