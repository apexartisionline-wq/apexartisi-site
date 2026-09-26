import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escalatePending } from "@/lib/help";
import { getSettings } from "@/lib/settings";
import { telegramConfigured } from "@/lib/telegram";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Η σελίδα του μέλους κάνει και η ίδια τον έλεγχο των 10 λεπτών, ώστε η
  // επανάληψη να μην εξαρτάται μόνο από το cron.
  await escalatePending(id).catch((e) => console.error("[help] escalation", e));

  const [req, s] = await Promise.all([
    prisma.helpRequest.findFirst({ where: { id, memberId: user.id } }),
    getSettings(),
  ]);
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  const waited = Date.now() - req.createdAt.getTime() >= s.helpEscalateMinutes * 60_000;
  return NextResponse.json({
    claimedByName: req.claimedByName,
    showHelpline: !req.claimedAt && (waited || !telegramConfigured()),
  });
}
