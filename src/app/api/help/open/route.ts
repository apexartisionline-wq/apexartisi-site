import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { helpState } from "@/lib/program";
import { getSettings } from "@/lib/settings";

// Κάθε άνοιγμα του κόκκινου κουμπιού καταγράφεται (το βλέπει η επόμενη συνεδρία).
// Επιστρέφει και το ανοιχτό αίτημα του μέλους (τελευταίες 24 ώρες, χωρίς «μιλήσαμε»/κλείσιμο — ίδιο φίλτρο με την
// κλιμάκωση), ώστε μετά από ανανέωση της σελίδας να φαίνεται η κατάσταση αντί να ξαναστέλνεται αίτημα (20/10).
export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return new NextResponse(null, { status: 401 });
  await prisma.helpOpen.create({ data: { memberId: user.id } });
  const [open, s] = await Promise.all([
    prisma.helpRequest.findFirst({
      where: { memberId: user.id, isDrill: false, resolvedAt: null, talkedAt: null, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);
  return NextResponse.json({
    ok: true,
    open: open ? { id: open.id, claimedByName: open.claimedByName, talked: false, showHelpline: helpState(open, new Date(), s).showHelpline } : null,
  });
}
