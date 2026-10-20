import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PURPOSES } from "./intake-rules";
import { addDays, athensToUtc, localParts } from "./time";

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
// Ο επισκέπτης (απλή αρχική, 20/10) δεν είναι εδώ: το πρόγραμμά του το κρατά το ensureGuestSchedule, σε σχέση με την ώρα που μπαίνει.

/** Επιπλέον ψεύτικα μέλη μόνο για τα ραντεβού της ημέρας (χωρίς σύνδεση: τυχαίος κωδικός). */
const EXTRA_MEMBERS: [string, string, string][] = [
  ["kostas", "Κώστας Δοκιμαστικός", "A-10005"],
  ["sofia", "Σοφία Δοκιμαστική", "A-10006"],
  ["petros", "Πέτρος Δοκιμαστικός", "A-10007"],
  ["lena", "Λένα Δοκιμαστική", "A-10008"],
];
/** Ψεύτικα μέλη μόνο για το πρόγραμμα του επισκέπτη (20/10): χωρίς αρχική αξιολόγηση, ώστε η 1η ατομική τους να δείχνει το ιστορικό. */
export const GUEST_MEMBERS: [string, string, string][] = [
  ["stathis", "Στάθης Δοκιμαστικός", "A-10009"],
  ["rania", "Ράνια Δοκιμαστική", "A-10010"],
  ["thanasis", "Θανάσης Δοκιμαστικός", "A-10011"],
  ["fotini", "Φωτεινή Δοκιμαστική", "A-10012"],
];

/** Τα ψεύτικα μέλη των ραντεβού της ημέρας και του επισκέπτη (χωρίς σύνδεση). */
export const DEMO_DAY_USERNAMES: string[] = [...EXTRA_MEMBERS, ...GUEST_MEMBERS].map((e) => e[0]);

/**
 * Είναι αυτή η θέση ένα από τα ψεύτικα ραντεβού της ημέρας; (ίδια ώρα, θέση, θεραπευτής και μέλη με το DEMO_PLAN.)
 * Στη δοκιμή αυτά δεν κλειδώνουν την πύλη «Εκκρεμεί σημείωμα» ούτε μετρούν ως «σε εξέλιξη» (17/10) — αλλιώς κάθε θεραπευτής
 * της δοκιμής θα κλειδωνόταν κάθε απόγευμα από ραντεβού που δεν έγιναν ποτέ.
 */
export function isDemoDaySlot(x: { hour: number; position: number; therapistUsername: string | null; memberUsernames: string[] }): boolean {
  return DEMO_PLAN.some((p) => p.hour === x.hour && p.position === x.position && p.therapist === x.therapistUsername && p.members.length === x.memberUsernames.length && p.members.every((m) => x.memberUsernames.includes(m)));
}

async function ensureExtraMembers(db: PrismaClient, today: string, list: [string, string, string][] = EXTRA_MEMBERS, assessed = true): Promise<void> {
  const staff = await db.user.findFirst({ where: { username: "anna" }, select: { id: true } });
  for (const [username, name, memberCode] of list) {
    if (await db.user.findUnique({ where: { username }, select: { id: true } })) continue;
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    const m = await db.user.create({ data: { username, name, memberCode, role: "MEMBER", source: "APEX", passwordHash, programStartDate: addDays(today, -20) } });
    await db.cycle.create({ data: { memberId: m.id, length: 8 } });
    // Έναρξη ολοκληρωμένη (όπως τα άλλα ψεύτικα μέλη με ιστορικό), αλλιώς φαίνονται κλειδωμένα στην έναρξη.
    // Τα μέλη του επισκέπτη μένουν χωρίς «αρχική αξιολόγηση», για να δείχνει η 1η ατομική τους το ιστορικό (Σ1).
    for (const key of assessed ? ["online_consent", "agreement", "assessment"] : ["online_consent", "agreement"]) await db.intakeCheck.create({ data: { memberId: m.id, key, doneById: staff?.id ?? m.id } });
    // Τα μέλη του επισκέπτη έχουν και τις συγκαταθέσεις (όπως τα ψεύτικα μέλη με ιστορικό), ώστε το Σ0 της 1ης ατομικής να είναι «ολοκληρώθηκε».
    if (!assessed) await ensureConsents(db, m.id, staff?.id ?? m.id);
  }
}

/** Συγκαταθέσεις «ΝΑΙ» σε όλους τους σκοπούς για ένα ψεύτικο μέλος (όσες λείπουν). Έκδοση «δοκιμή», όπως στο seed. */
async function ensureConsents(db: PrismaClient, memberId: string, staffId: string): Promise<void> {
  const have = new Set((await db.consent.findMany({ where: { memberId }, select: { purpose: true } })).map((c) => c.purpose));
  for (const p of PURPOSES) {
    if (have.has(p.key)) continue;
    await db.consent.create({ data: { memberId, purpose: p.key, choice: "YES", version: "δοκιμή", recordedById: p.byMember ? memberId : staffId } });
  }
}

/**
 * Ραντεβού επισκεπτών (απλή αρχική) που τελείωσαν πριν από > 1 ώρα χωρίς σημείωμα σβήνονται — όπως τα ψεύτικα της ημέρας.
 * Τρέχει και όταν ανοίγει το «Σήμερα» οποιουδήποτε στη δοκιμή (ensureDemoToday), ώστε να μη μένει «Χωρίς καταγραφή» στο μέλος
 * από ραντεβού παρουσίασης. Μόνο λογαριασμοί με simpleHome· κανενός άλλου θεραπευτή.
 */
export async function cleanupGuestSlots(db: PrismaClient, now = new Date()): Promise<number> {
  const old = await db.slot.findMany({
    where: { therapist: { simpleHome: true }, note: null, pairNotes: { none: {} }, startsAt: { lt: new Date(now.getTime() - 100 * 60_000) } },
    select: { id: true },
  });
  if (old.length) await db.slot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return old.length;
}

/** Ελεύθερη θέση (δωμάτιο) για μια ώρα: το 4ο δωμάτιο ή, αν είναι πιασμένο, μία από τις 21+ (όπως το bookDemo). */
async function freePosition(db: PrismaClient, date: string, hour: number): Promise<number> {
  const candidates = [4, ...Array.from({ length: 30 }, (_, i) => 21 + i)];
  const taken = new Set((await db.slot.findMany({ where: { date, hour, position: { in: candidates } }, select: { position: true } })).map((x) => x.position));
  return candidates.find((p) => !taken.has(p)) ?? 60;
}

const roundUp5 = (d: Date) => new Date(Math.ceil(d.getTime() / 300_000) * 300_000);

/**
 * Πρόγραμμα παρουσίασης για τον επισκέπτη (υπεύθυνη 20/10: «βάλε στο πρόγραμμα στο προφίλ του Πάνου ραντεβού, να δείχνουμε
 * τα κουμπιά σύνδεσης, την προετοιμασία, όλο αυτό το μοντέλο»). Τρέχει κάθε φορά που ανοίγει το «Σήμερα» ένας θεραπευτής
 * με «απλή αρχική», μόνο στη δοκιμή, και κρατά:
 *  - σήμερα: ΔΥΟ ραντεβού μπροστά του όποια ώρα κι αν μπει (το πρώτο σε ~10′, το επόμενο μία ώρα μετά) — πρώτα με μέλος που
 *    έχει ιστορικό (Νίκος: σημειώματα, πλάνο → κανονικό σημειωματάριο), μετά με δικό του νέο μέλος (1η ατομική → ιστορικό)·
 *  - επόμενες μέρες: ατομικές στις 11:00/14:00 και ένα Therapair, ώστε το «Τις επόμενες 7 μέρες» να έχει περιεχόμενο·
 *  - καθάρισμα: δικά του ραντεβού που τελείωσαν πριν από ώρα χωρίς σημείωμα σβήνονται (όπως τα ψεύτικα της ημέρας).
 * Μέλη: τα ψεύτικα με ιστορικό (nikos, eleni, giorgos) και τα GUEST_MEMBERS. Δεν αγγίζει τίποτα άλλου θεραπευτή.
 */
export async function ensureGuestSchedule(db: PrismaClient, therapist: { id: string; therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null }, now = new Date()): Promise<void> {
  const today = localParts(now).date;
  await ensureExtraMembers(db, today, GUEST_MEMBERS, false);
  const kind = therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL";
  const byName = new Map((await db.user.findMany({ where: { username: { in: ["nikos", "eleni", "giorgos", ...GUEST_MEMBERS.map((g) => g[0])] }, role: "MEMBER", active: true }, select: { id: true, username: true } })).map((u) => [u.username, u.id]));
  // Τα μέλη του επισκέπτη ξεκινούν από την 1η ατομική (ιστορικό): αν κάποιο σημειώθηκε «αξιολόγηση: έγινε» χωρίς πραγματική
  // ολοκληρωμένη αξιολόγηση (παλιότερο seed), το σημάδι φεύγει — μόνο για αυτά τα ψεύτικα μέλη.
  const guestIds = GUEST_MEMBERS.map((g) => byName.get(g[0])).filter((x): x is string => Boolean(x));
  if (guestIds.length) {
    const done = new Set((await db.assessment.findMany({ where: { memberId: { in: guestIds }, complete: true }, select: { memberId: true } })).map((a) => a.memberId));
    const stale = guestIds.filter((id) => !done.has(id));
    if (stale.length) await db.intakeCheck.deleteMany({ where: { memberId: { in: stale }, key: "assessment" } });
    // Συγκαταθέσεις σε μέλη που φτιάχτηκαν από παλιότερη έκδοση χωρίς αυτές (για καθαρό Σ0).
    const staff = await db.user.findFirst({ where: { username: "anna" }, select: { id: true } });
    for (const id of guestIds) await ensureConsents(db, id, staff?.id ?? id);
  }
  // 1. Καθάρισμα: ό,τι τελείωσε πριν από > 1 ώρα χωρίς σημείωμα (ατομική 40′ → έναρξη πριν > 100′).
  await cleanupGuestSlots(db, now);
  const book = async (date: string, startsAt: Date, usernames: string[]) => {
    const ids = usernames.map((u) => byName.get(u)).filter((x): x is string => Boolean(x));
    if (ids.length !== usernames.length) return false;
    if (await db.booking.findFirst({ where: { memberId: { in: ids }, slot: { date, therapistId: therapist.id } }, select: { id: true } })) return false;
    const hour = localParts(startsAt).hour;
    const pair = ids.length === 2;
    const slot = await db.slot.create({ data: { date, hour, position: await freePosition(db, date, hour), therapistId: therapist.id, startsAt, kind: pair ? "PAIR" : "INDIVIDUAL", pairApprovedAt: pair ? now : null } });
    for (const memberId of ids) await db.booking.create({ data: { slotId: slot.id, memberId, cycleId: await cycleForDemoBooking(db, memberId), kind } });
    return true;
  };
  // 2. Σήμερα: δύο ραντεβού μπροστά του. Το πρώτο σε ~10′, ώστε «Μπες» και σημειωματάριο (ανοίγει 15′ πριν) να δουλεύουν αμέσως.
  const upcoming = await db.slot.findMany({ where: { therapistId: therapist.id, date: today, startsAt: { gt: now }, bookings: { some: {} } }, orderBy: { startsAt: "asc" }, select: { startsAt: true } });
  let t = roundUp5(new Date(now.getTime() + 10 * 60_000));
  const last = upcoming[upcoming.length - 1];
  if (last && last.startsAt.getTime() + 60 * 60_000 > t.getTime()) t = roundUp5(new Date(last.startsAt.getTime() + 60 * 60_000));
  const todayOrder = ["nikos", "stathis", "eleni", "rania", "giorgos", "thanasis", "fotini"];
  for (let need = 2 - upcoming.length; need > 0 && localParts(t).date === today; ) {
    const u = todayOrder.shift();
    if (!u) break;
    if (await book(today, t, [u])) { need--; t = new Date(t.getTime() + 60 * 60_000); }
  }
  // 3. Επόμενες μέρες (σταθερές ώρες, αν δεν έχει ήδη κάτι εκείνη την ώρα).
  const week: { day: number; hour: number; members: string[] }[] = [
    { day: 1, hour: 11, members: ["eleni"] }, { day: 1, hour: 14, members: ["stathis"] },
    { day: 2, hour: 11, members: ["giorgos"] }, { day: 2, hour: 16, members: ["thanasis", "fotini"] },
    { day: 4, hour: 11, members: ["nikos"] }, { day: 4, hour: 14, members: ["rania"] },
  ];
  for (const w of week) {
    const date = addDays(today, w.day);
    if (await db.holiday.findUnique({ where: { date }, select: { date: true } })) continue;
    if (await db.slot.findFirst({ where: { therapistId: therapist.id, date, hour: w.hour, bookings: { some: {} } }, select: { id: true } })) continue;
    await book(date, athensToUtc(date, w.hour), w.members);
  }
}

/** Τίποτα δεν θα άλλαζε το ensureDemoDay: δεν υπάρχει eva, ή υπάρχουν όλα τα επιπλέον μέλη και κάθε θέση του σχεδίου παραλείπεται. */
async function demoDayReady(db: PrismaClient, date: string): Promise<boolean> {
  const usernames = [...new Set(["eva", ...EXTRA_MEMBERS.map((e) => e[0]), ...DEMO_PLAN.flatMap((p) => [p.therapist, ...p.members])])];
  const [users, holiday, slots] = await Promise.all([
    db.user.findMany({ where: { username: { in: usernames } }, select: { id: true, username: true, active: true } }),
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
    // Ίδιος όρος με το ensureDemoDay: θεραπευτής που δεν υπάρχει ή είναι ανενεργός → η θέση παραλείπεται.
    if (!users.find((u) => u.username === p.therapist && u.active) || members.length !== p.members.length) return true;
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
    // Μόνο ενεργός θεραπευτής (20/10): απενεργοποιημένος λογαριασμός (π.χ. επισκέπτης μετά την παρουσίαση) δεν παίρνει ραντεβού.
    const therapist = await db.user.findFirst({ where: { username: p.therapist, active: true } });
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
