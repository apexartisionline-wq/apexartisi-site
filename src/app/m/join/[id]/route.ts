import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionJoinable, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { roomUrl } from "@/lib/rooms";

// «Μπες στην ατομική σου»: το μέλος πατά πάντα το ίδιο κουμπί και το app τον
// στέλνει στο δωμάτιο της θέσης του.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.redirect(new URL("/login", req.url), 303);
  const s = await getSettings();
  const booking = await prisma.booking.findFirst({ where: { id, memberId: user.id }, include: { slot: true } });
  const room = booking ? roomUrl(s.rooms[booking.slot.position - 1]) : "";
  // Ίδιο παράθυρο με το κουμπί της σελίδας (20/10): το Therapair διαρκεί 60′, όχι 40′ — αλλιώς στα τελευταία 20′ χανόταν η παρουσία.
  if (!booking || !sessionJoinable(booking.slot.startsAt, new Date(), s, slotMinutes(booking.slot.kind, s))) return NextResponse.redirect(new URL("/m", req.url), 303);
  // Χωρίς έγκυρο δωμάτιο (14/10): δεν καταγράφεται «Μπες» (δεν μπήκε πουθενά) και το μέλος βλέπει γιατί.
  if (!room) return NextResponse.redirect(new URL("/m?e=room", req.url), 303);
  if (!booking.joinedAt) await prisma.booking.update({ where: { id }, data: { joinedAt: new Date() } });
  return NextResponse.redirect(room, 303);
}
