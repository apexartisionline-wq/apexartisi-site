import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionJoinable } from "@/lib/program";
import { getSettings } from "@/lib/settings";

// «Μπες στη συνεδρία σου»: το μέλος πατά πάντα το ίδιο κουμπί και το app τον
// στέλνει στο δωμάτιο της θέσης του.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.redirect(new URL("/login", req.url), 303);
  const s = await getSettings();
  const booking = await prisma.booking.findFirst({ where: { id, memberId: user.id }, include: { slot: true } });
  const room = booking ? s.rooms[booking.slot.position - 1] : "";
  if (!booking || !room || !sessionJoinable(booking.slot.startsAt, new Date(), s)) {
    return NextResponse.redirect(new URL("/m", req.url), 303);
  }
  if (!booking.joinedAt) await prisma.booking.update({ where: { id }, data: { joinedAt: new Date() } });
  return NextResponse.redirect(room, 303);
}
