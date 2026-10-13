import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberIntake } from "@/lib/intake";
import { cancelledGroupTimes } from "@/lib/groups";
import { joinableGroup } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { localParts } from "@/lib/time";

// «Μπες στην ομάδα»: πάντα το ίδιο δωμάτιο· η παρουσία καταγράφεται αυτόματα.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return NextResponse.redirect(new URL("/login", req.url), 303);
  const s = await getSettings();
  // Πριν την πρώτη ομάδα: ολοκληρωμένη έναρξη συνεργασίας (και δήλωση εμπιστευτικότητας).
  if (s.requireIntake && !(await memberIntake(user)).status.complete) return NextResponse.redirect(new URL("/m/start", req.url), 303);
  const now = new Date();
  const date = localParts(now).date;
  const g = joinableGroup(now, s);
  if (!s.groupRoomUrl || !g || (await cancelledGroupTimes(date)).has(g.time)) return NextResponse.redirect(new URL("/m", req.url), 303);
  await prisma.attendance.upsert({
    where: { memberId_date: { memberId: user.id, date } },
    create: { memberId: user.id, date },
    update: {},
  });
  return NextResponse.redirect(s.groupRoomUrl, 303);
}
