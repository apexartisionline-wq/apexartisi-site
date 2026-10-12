import type { PrismaClient } from "@prisma/client";
import { athensToUtc } from "./time";

/**
 * Ψεύτικα ραντεβού της ημέρας για τη δοκιμαστική εγκατάσταση (χωρίς "server-only", για να το τρέχει
 * και το script prisma/demo-today.ts). Ποιος βλέπει ποιον: ώρα, θεραπευτής (θέση = δωμάτιο), μέλη.
 * Δύο μέλη = Therapair.
 */
export const DEMO_PLAN: { hour: number; therapist: string; position: number; members: string[] }[] = [
  { hour: 12, therapist: "dimitra", position: 3, members: ["nikos"] },
  { hour: 13, therapist: "anna", position: 1, members: ["eleni"] },
  { hour: 14, therapist: "vasilis", position: 2, members: ["giorgos"] },
  { hour: 15, therapist: "dimitra", position: 3, members: ["sofia", "petros"] },
];

/** Ίδιος κανόνας με την κράτηση: γεμάτος κύκλος κλείνει και ανοίγει νέος (αλλιώς «ατομική 9 από 8»). */
export async function cycleForDemoBooking(db: PrismaClient, memberId: string, length = 8): Promise<string> {
  const open = await db.cycle.findFirst({ where: { memberId, closedAt: null }, orderBy: { startedAt: "desc" }, include: { _count: { select: { bookings: true } } } });
  if (open && open._count.bookings < open.length) return open.id;
  if (open) await db.cycle.update({ where: { id: open.id }, data: { closedAt: new Date() } });
  return (await db.cycle.create({ data: { memberId, length } })).id;
}

/**
 * Βάζει τα ψεύτικα ραντεβού μιας μέρας, μόνο αν η μέρα δεν έχει κανένα ραντεβού. Ξανατρέχει άφοβα.
 * Καλείται από το build (demo-today) και από το «Σήμερα» της δοκιμής, ώστε να υπάρχουν ραντεβού
 * και τις μέρες που δεν έγινε build (11/10).
 */
export async function ensureDemoDay(db: PrismaClient, date: string): Promise<boolean> {
  if (!(await db.user.findUnique({ where: { username: "eva" }, select: { id: true } }))) return false;
  // Η «δοκιμαστική ατομική τώρα» (4ο δωμάτιο) δεν μετράει: τα ραντεβού της ημέρας μπαίνουν έτσι κι αλλιώς.
  if (await db.booking.findFirst({ where: { slot: { date, position: { not: 4 } } }, select: { id: true } })) return false;
  for (const p of DEMO_PLAN) {
    const therapist = await db.user.findUnique({ where: { username: p.therapist } });
    const members = await db.user.findMany({ where: { username: { in: p.members } } });
    if (!therapist || members.length !== p.members.length) continue;
    const pair = members.length === 2;
    const slot =
      (await db.slot.findFirst({ where: { date, hour: p.hour, position: p.position } })) ??
      (await db.slot.create({ data: { date, hour: p.hour, position: p.position, therapistId: therapist.id, startsAt: athensToUtc(date, p.hour) } }));
    await db.slot.update({ where: { id: slot.id }, data: { therapistId: therapist.id, kind: pair ? "PAIR" : "INDIVIDUAL", pairApprovedAt: pair ? new Date() : null } });
    for (const m of members) {
      const cycleId = await cycleForDemoBooking(db, m.id);
      await db.booking.create({ data: { slotId: slot.id, memberId: m.id, cycleId, kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" } });
    }
  }
  return true;
}
