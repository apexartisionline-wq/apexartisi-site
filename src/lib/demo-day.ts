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

/** Τα ψεύτικα μέλη των ραντεβού της ημέρας (χωρίς σύνδεση). */
export const DEMO_DAY_USERNAMES: string[] = EXTRA_MEMBERS.map((e) => e[0]);

/**
 * Είναι αυτή η θέση ένα από τα ψεύτικα ραντεβού της ημέρας; (ίδια ώρα, θέση, θεραπευτής και μέλη με το DEMO_PLAN.)
 * Στη δοκιμή αυτά δεν κλειδώνουν την πύλη «Εκκρεμεί σημείωμα» ούτε μετρούν ως «σε εξέλιξη» (17/10) — αλλιώς κάθε θεραπευτής
 * της δοκιμής θα κλειδωνόταν κάθε απόγευμα από ραντεβού που δεν έγιναν ποτέ.
 */
export function isDemoDaySlot(x: { hour: number; position: number; therapistUsername: string | null; memberUsernames: string[] }): boolean {
  return DEMO_PLAN.some((p) => p.hour === x.hour && p.position === x.position && p.therapist === x.therapistUsername && p.members.length === x.memberUsernames.length && p.members.every((m) => x.memberUsernames.includes(m)));
}

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

/** Τίποτα δεν θα άλλαζε το ensureDemoDay: δεν υπάρχει eva, ή υπάρχουν όλα τα επιπλέον μέλη και κάθε θέση του σχεδίου παραλείπεται. */
async function demoDayReady(db: PrismaClient, date: string): Promise<boolean> {
  const usernames = [...new Set(["eva", ...EXTRA_MEMBERS.map((e) => e[0]), ...DEMO_PLAN.flatMap((p) => [p.therapist, ...p.members])])];
  const [users, holiday, slots] = await Promise.all([
    db.user.findMany({ where: { username: { in: usernames } }, select: { id: true, username: true } }),
    db.holiday.findUnique({ where: { date }, select: { date: true } }),
    db.slot.findMany({ where: { date }, select: { hour: true, position: true, _count: { select: { bookings: true } } } }),
  ]);
  const id = new Map(users.map((u) => [u.username, u.id]));
  if (!id.has("eva")) return true;
  if (EXTRA_MEMBERS.some((e) => !id.has(e[0]))) return false;
  if (holiday) return true;
  const memberIds = DEMO_PLAN.flatMap((p) => p.members.map((m) => id.get(m))).filter((x): x is string => Boolean(x));
  const booked = new Set((await db.booking.findMany({ where: { memberId: { in: memberIds }, slot: { date } }, select: { memberId: true } })).map((b) => b.memberId));
  return DEMO_PLAN.every((p) => {
    const members = p.members.map((m) => id.get(m)).filter((x): x is string => Boolean(x));
    if (!id.has(p.therapist) || members.length !== p.members.length) return true;
    if (slots.some((x) => x.hour === p.hour && x.position === p.position && x._count.bookings > 0)) return true;
    return members.some((m) => booked.has(m));
  });
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
/**
 * Ψεύτικο ραντεβού της ημέρας που ΤΕΛΕΙΩΣΕ χωρίς σημείωμα σβήνεται (υπεύθυνη 17/10: «δεν θέλω να υπάρχει περιθώριο για
 * εκκρεμότητες όπως το να γράφει σημείωμα μετά»). Τα ψεύτικα ραντεβού υπάρχουν μόνο για να γεμίζει το πρόγραμμα· δεν
 * αφήνουν πίσω τους «Γράψε σημείωμα». Τρέχει κάθε φορά που ανοίγει το «Σήμερα» της δοκιμής (μία ερώτηση).
 */
export async function cleanupDemoDay(db: PrismaClient, date: string, now = new Date()): Promise<number> {
  const rows = await db.slot.findMany({
    where: { date, note: null, pairNotes: { none: {} }, startsAt: { lt: new Date(now.getTime() - 60 * 60_000) } },
    select: { id: true, hour: true, position: true, therapist: { select: { username: true } }, bookings: { select: { member: { select: { username: true } } } } },
  });
  const ids = rows.filter((r) => isDemoDaySlot({ hour: r.hour, position: r.position, therapistUsername: r.therapist?.username ?? null, memberUsernames: r.bookings.map((b) => b.member.username) })).map((r) => r.id);
  if (ids.length) await db.slot.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

export async function ensureDemoDay(db: PrismaClient, date: string, now = new Date()): Promise<boolean> {
  // Γρήγορος έλεγχος (15/10): τέσσερις ερωτήσεις μαζί για να δούμε αν η μέρα είναι ήδη έτοιμη — ίδιοι όροι με τον βρόχο
  // παρακάτω. Πριν, κάθε κρύο ξεκίνημα της δοκιμής έκανε ~30 ερωτήσεις μία-μία (~6″ με τη βάση στη Φρανκφούρτη) πριν
  // καν αρχίσει το «Σήμερα» του θεραπευτή, και μαζί με τα υπόλοιπα ξεπερνούσε το όριο των 10″ του Netlify.
  if (await demoDayReady(db, date)) return false;
  if (!(await db.user.findUnique({ where: { username: "eva" }, select: { id: true } }))) return false;
  await ensureExtraMembers(db, date);
  // Συμπληρώνει ό,τι λείπει: παραλείπει θέση που έχει ήδη κράτηση και μέλος που έχει ήδη ατομική τη μέρα αυτή.
  // Δεν αγγίζει μέρα αργίας.
  if (await db.holiday.findUnique({ where: { date }, select: { date: true } })) return false;
  let added = false;
  for (const p of DEMO_PLAN) {
    // Μόνο ραντεβού που δεν έχουν ξεκινήσει ακόμα (17/10): ένα ψεύτικο ραντεβού στο παρελθόν θα φαινόταν «χωρίς σημείωμα».
    if (athensToUtc(date, p.hour) <= now) continue;
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
