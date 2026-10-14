import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Το έντυπο εχεμύθειας (μια έκδοση): μόνο προσωπικό, με σύνδεση. Καταγράφεται ποιος το άνοιξε.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "MEMBER") return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const d = await prisma.staffDocument.findUnique({ where: { id }, select: { file: true, mime: true, fileName: true } });
  if (!d) return new NextResponse(null, { status: 404 });
  await logAccess(user.id, null, "nda_view");
  return new NextResponse(Buffer.from(d.file), { headers: { "content-type": d.mime, "cache-control": "private, no-store", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.fileName)}` } });
}
