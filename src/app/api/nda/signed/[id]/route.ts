import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Το υπογεγραμμένο έντυπο ενός συνεργάτη: μόνο ο ίδιος ή η διαχείριση. Καταγράφεται.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "MEMBER") return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const c = await prisma.staffConsent.findUnique({ where: { id }, select: { userId: true, signedFile: true, signedMime: true, signedFileName: true } });
  if (!c?.signedFile || !c.signedMime) return new NextResponse(null, { status: 404 });
  if (c.userId !== user.id && user.role !== "ADMIN") return new NextResponse(null, { status: 403 });
  await logAccess(user.id, null, "nda_signed_view");
  return new NextResponse(Buffer.from(c.signedFile), { headers: { "content-type": c.signedMime, "cache-control": "private, no-store", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(c.signedFileName ?? "signed")}` } });
}
