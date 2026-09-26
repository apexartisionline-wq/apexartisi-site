import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyTherapists } from "@/lib/help";
import { telegramConfigured } from "@/lib/telegram";

export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Αν υπάρχει ήδη ανοιχτό αίτημα (π.χ. διπλό πάτημα), συνεχίζουμε εκείνο.
  const existing = await prisma.helpRequest.findFirst({
    where: { memberId: user.id, resolvedAt: null, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  const req =
    existing ??
    (await prisma.helpRequest.create({ data: { memberId: user.id }, include: { member: { select: { name: true } } } }));

  let delivered = true;
  if (!existing) {
    try {
      await notifyTherapists(req as typeof req & { member: { name: string } });
      delivered = telegramConfigured();
    } catch (e) {
      console.error("[help] αποτυχία αποστολής", e);
      delivered = false;
    }
  }
  return NextResponse.json({
    id: req.id,
    status: { claimedByName: req.claimedByName, showHelpline: !delivered },
  });
}
