import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rangeResponse } from "@/lib/library";

// Προβολή αρχείου της βιβλιοθήκης μέσα στο app (όχι λήψη).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item?.data || (!item.published && user.role !== "ADMIN")) return new NextResponse(null, { status: 404 });
  return rangeResponse(req, Buffer.from(item.data), {
    "content-type": item.mime ?? "application/octet-stream",
    "content-disposition": "inline",
  });
}
