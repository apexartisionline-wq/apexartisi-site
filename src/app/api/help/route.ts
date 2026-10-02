import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requestHuman } from "@/lib/help";
import { helpState } from "@/lib/program";
import { getSettings } from "@/lib/settings";

// «Θέλω να μιλήσω με άνθρωπο».
export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = await requestHuman(user.id);
  const [req, s] = await Promise.all([prisma.helpRequest.findUniqueOrThrow({ where: { id } }), getSettings()]);
  return NextResponse.json({ id, claimedByName: req.claimedByName, showHelpline: helpState(req, new Date(), s).showHelpline });
}
