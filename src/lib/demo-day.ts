import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { addDays, athensToUtc } from "./time";

/**
 * Ψεύτικα ραντεβού της ημέρας για τη δοκιμαστική εγκατάσταση (χωρίς "server-only", για να το τρέχει
 * και το script prisma/demo-today.ts). Ποιος βλέπει ποιον: ώρα, θεραπευτής (θέση = δωμάτιο), μέλη.
 * Δύο μέλη = Therapair.
 */
export const DEMO_PLAN: { hour: number; therapist: string; position: number; members: string[] }[] = [
  // Κάθε θεραπευτής έχει γεμάτη μέρα (12/10: φαινόταν μόνο μία συνεδρία και έμοιαζε ότι λείπει το πρόγραμμα).
  { hour: 10, therapist: "anna", position: 1, members: ["kostas"] },
  { hour: 11, therapist: "vasilis", position: 2, members: ["sofia"] },
  { hour: 12, therapist: "dimitra", position: 3, members: ["nikos"] },
  { hour: 13, therapist: "anna", position: 1, members: ["eleni"] },
  { hour: 14, therapist: "vasilis", position: 2, members: ["giorgos"] },
  { hour: 15, therapist: "dimitra", position: 3, members: ["petros", "lena"] },
];

/** Επιπλέον ψεύτικα μέλη μόνο για τα ραντεβού της ημέρας (χωρίς σύνδεση: τυχαίος κωδικός). */
const EXTRA_MEMBERS: [string, string, string][] = [
  ["kostas", "Κώστας Δοκιμαστικός", "A-10005"],
  ["sofia", "Σοφία Δοκιμαστική", "A-10006"],
  ["petros", "Πέτρος Δοκιμαστικός", "A-10007"],
  ["lena", "Λένα Δοκιμαστική", "A-10008"],
];

async function ensureExtraMembers(db: PrismaClient, today: string): Promise<void> {
  const staff = await db.user.findFirst({ where: { username: "anna" }, select: { id: true } });
  for (const [username, name, memberCode] of EXTRA_MEMBERS) {
    if (await db.user.findUnique({ where: { username }, select: { id: true } })) continue;
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    const m = await db.user.create({ data: { username, name, memberCode, role: "MEMBER", source: "APEX", passwordHash, programStartDate: addDays(today, -20) } });
    await db.cycle.create({ data: { memberId: m.id, length: 8 } });
    // Έναρξη ολοκληρωμένη (όπως τα άλλα ψεύτικα μέλη με ιστορικό), αλλιώς φαίνονται κλειδωμένα στην έναρξη.
    for (const key of ["online_consent", "agreement", "assessment"]) await db.intakeCheck.create({ data: { memberId: m.id, key, doneById: staff?.id ?? m.id } });
  }
}

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
  await ensureExtraMembers(db, date);
  // Συμπληρώνει ό,τι λείπει: παραλείπει θέση που έχει ήδη κράτηση και μέλος που έχει ήδη ατομική τη μέρα αυτή.
  // Δεν αγγίζει μέρα αργίας.
  if (await db.holiday.findUnique({ where: { date }, select: { date: true } })) return false;
  let added = false;
  for (const p of DEMO_PLAN) {
    const therapist = await db.user.findUnique({ where: { username: p.therapist } });
    const members = await db.user.findMany({ where: { username: { in: p.members } } });
    if (!therapist || members.length !== p.members.length) continue;
    const existing = await db.slot.findFirst({ where: { date, hour: p.hour, position: p.position }, include: { _count: { select: { bookings: true } } } });
    if (existing && existing._count.bookings > 0) continue;
    if (await db.booking.findFirst({ where: { memberId: { in: members.map((m) => m.id) }, slot: { date } }, select: { id: true } })) continue;
    const pair = members.length === 2;
    const slot = existing ?? (await db.slot.create({ data: { date, hour: p.hour, position: p.position, therapistId: therapist.id, startsAt: athensToUtc(date, p.hour) } }));
    await db.slot.update({ where: { id: slot.id }, data: { therapistId: therapist.id, kind: pair ? "PAIR" : "INDIVIDUAL", pairApprovedAt: pair ? new Date() : null } });
    for (const m of members) {
      const cycleId = await cycleForDemoBooking(db, m.id);
      await db.booking.create({ data: { slotId: slot.id, memberId: m.id, cycleId, kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" } });
    }
    added = true;
  }
  return added;
}
