import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";

// Η εικόνα ενός κειμένου της ημέρας (π.χ. κάρτα κινήτρων). Μέλη: μόνο αφού βγει· προσωπικό: πάντα. Μόνο με σύνδεση.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const c = await prisma.content.findUnique({ where: { id }, select: { date: true, kind: true, imageMime: true, image: true } });
  if (!c?.image || !c.imageMime) return new NextResponse(null, { status: 404 });
  if (user.role === "MEMBER") {
    const s = await getSettings();
    if (!isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, new Date())) return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(Buffer.from(c.image), { headers: { "content-type": c.imageMime, "cache-control": "private, max-age=3600", "content-disposition": "inline" } });
}
