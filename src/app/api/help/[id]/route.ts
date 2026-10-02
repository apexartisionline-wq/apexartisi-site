import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escalatePending } from "@/lib/help";
import { helpState } from "@/lib/program";
import { getSettings } from "@/lib/settings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Πρώτα ο έλεγχος ότι το αίτημα ανήκει στο μέλος.
  const own = await prisma.helpRequest.findFirst({ where: { id, memberId: user.id }, select: { id: true } });
  if (!own) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Η σελίδα του μέλους κάνει και η ίδια τον έλεγχο κλιμάκωσης, ώστε να μην εξαρτάται μόνο από το cron.
  await escalatePending(id).catch((e) => console.error("[help] escalation", e));
  const [req, s] = await Promise.all([prisma.helpRequest.findUniqueOrThrow({ where: { id } }), getSettings()]);
  return NextResponse.json({
    claimedByName: req.claimedByName,
    talked: Boolean(req.talkedAt),
    showHelpline: helpState(req, new Date(), s).showHelpline,
  });
}
