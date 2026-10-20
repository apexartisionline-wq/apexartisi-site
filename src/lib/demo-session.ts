import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { cycleForDemoBooking, cleanupDemoDay, ensureDemoDay } from "./demo-day";
import { localParts } from "./time";
import { dec } from "./crypto";
import { hasPlanContent, missingSections, type PlanData } from "./safety-plan";

/** Δοκιμαστική εγκατάσταση (Netlify, ψεύτικα στοιχεία): εκεί υπάρχει DEMO_SEED=1. */
export const isDemoSite = (): boolean => process.env.DEMO_SEED === "1";

const DEMO_MEMBER = "nikos";
const DEMO_POSITION = 4; // 4ο δωμάτιο: τα ψεύτικα ραντεβού της ημέρας είναι στα 1–3 (και του επισκέπτη «panos» στο 4, 11:00/14:00 — γι' αυτό το bookDemo ελέγχει αν η θέση είναι πιασμένη και πάει σε 21+)

/**
 * «Δοκιμαστική ατομική τώρα» (11/10): για να δει όποιος μπαίνει στη δοκιμή πώς συνδέεται και τι
 * βλέπει μέσα στην ατομική. Φτιάχνει (ή ξαναχρησιμοποιεί) μια θέση της τρέχουσας ώρας στο 4ο δωμάτιο,
 * με έναρξη σε 2 λεπτά, για τον θεραπευτή που το πάτησε, και κράτηση για το ψεύτικο μέλος με ιστορικό.
 * Μόνο στη δοκιμαστική εγκατάσταση.
 */
export async function startDemoSession(therapist: { id: string; therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null }): Promise<string | null> {
  if (!isDemoSite()) return null;
  const member = await prisma.user.findUnique({ where: { username: DEMO_MEMBER }, select: { id: true, active: true } });
  if (!member || !member.active) return null;
  return bookDemo(therapist, member.id, DEMO_POSITION);
}

// 5η θέση: μόνο για τη «δοκιμαστική 1η ατομική», ώστε να μη μπλέκεται με την ατομική του Νίκου στην 4η.
const FIRST_POSITION = 5;
// Ψεύτικα ονόματα στο ύφος των άλλων ψεύτικων μελών (το «Σήμερα» τα κόβει σε «Όνομα Δ.»).
const FIRST_NAMES = ["Στέλιος Δοκιμαστικός", "Άρτεμις Δοκιμαστική", "Χρήστος Δοκιμαστικός", "Ζωή Δοκιμαστική", "Αλέξης Δοκιμαστικός", "Ίρις Δοκιμαστική", "Πάνος Δοκιμαστικός", "Δάφνη Δοκιμαστική"];

/**
 * «Δοκιμαστική 1η ατομική (νέο μέλος)» (υπεύθυνη 16/10: «θέλω να το δω από την 1η ατομική»): φτιάχνει ένα ΚΑΙΝΟΥΡΓΙΟ
 * ψεύτικο μέλος χωρίς ιστορικό — συναίνεση και συμφωνητικό έτοιμα (τα κάνει η διαχείριση πριν), η αρχική αξιολόγηση
 * εκκρεμεί — και την πρώτη του ατομική σε 2 λεπτά με τον θεραπευτή που το πάτησε. Ψεύτικο μέλος χωρίς σύνδεση
 * (τυχαίος κωδικός). Δεν σβήνει τίποτα: κάθε πάτημα = νέο μέλος, εκτός αν η προηγούμενη 1η ατομική δεν έχει τελειώσει.
 * Μόνο στη δοκιμαστική εγκατάσταση.
 */
export async function startDemoFirstSession(therapist: { id: string; therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null }): Promise<string | null> {
  if (!isDemoSite()) return null;
  const now = new Date();
  const { getSettings } = await import("./settings");
  const minutes = (await getSettings()).sessionMinutes;
  const open = await prisma.slot.findFirst({
    where: { date: localParts(now).date, position: { in: [FIRST_POSITION, ...Array.from({ length: 30 }, (_, i) => 21 + i)] }, therapistId: therapist.id, kind: "INDIVIDUAL", note: null, startsAt: { gt: new Date(now.getTime() - minutes * 60_000) }, bookings: { some: { member: { username: { startsWith: "neo-" } } } } },
    orderBy: { startsAt: "desc" },
    select: { id: true, startsAt: true },
  });
  if (open) {
    if (open.startsAt > now) await prisma.slot.update({ where: { id: open.id }, data: { startsAt: new Date(now.getTime() + 2 * 60_000) } });
    return open.id;
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const n = (await prisma.user.count({ where: { username: { startsWith: "neo-" } } })) + 1;
  const stamp = now.getTime().toString(36);
  const today = localParts(now).date;
  const member = await prisma.user.create({
    data: {
      username: `neo-${stamp}`, name: FIRST_NAMES[(n - 1) % FIRST_NAMES.length], memberCode: `N-${stamp.toUpperCase()}`, role: "MEMBER", source: "APEX",
      passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), programStartDate: today,
    },
  });
  await prisma.cycle.create({ data: { memberId: member.id, length: 8 } });
  const by = admin?.id ?? therapist.id;
  // Σ0 (ενημέρωση, συναίνεση, συμφωνητικό) γίνεται πριν την 1η ατομική· η αρχική αξιολόγηση μένει για την ατομική.
  for (const key of ["online_consent", "agreement"]) await prisma.intakeCheck.create({ data: { memberId: member.id, key, doneById: by } });
  for (const purpose of ["record", "journal", "forms", "telegram", "self_message", "emergency_contact", "confidentiality"]) {
    await prisma.consent.create({ data: { memberId: member.id, purpose, choice: "YES", version: "δοκιμή", recordedById: purpose === "confidentiality" ? member.id : by } });
  }
  return bookDemo(therapist, member.id, FIRST_POSITION);
}

/**
 * «Δοκιμαστική 2η ατομική (πλάνο υποστήριξης)» (17/10): το πιο πρόσφατο ψεύτικο μέλος της «Δοκιμαστικής 1ης ατομικής» που
 * ολοκλήρωσε το ιστορικό αλλά δεν έχει ακόμα πλάνο υποστήριξης. Αν δεν υπάρχει, null (το κουμπί δεν φαίνεται).
 */
export async function demoSecondCandidate(): Promise<{ id: string; name: string } | null> {
  if (!isDemoSite()) return null;
  const neo = await prisma.user.findMany({ where: { username: { startsWith: "neo-" }, role: "MEMBER" }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 20 });
  if (neo.length === 0) return null;
  const ids = neo.map((m) => m.id);
  const [checks, plans] = await Promise.all([
    prisma.intakeCheck.findMany({ where: { memberId: { in: ids }, key: "assessment" }, select: { memberId: true } }),
    prisma.safetyPlan.findMany({ where: { memberId: { in: ids } }, select: { memberId: true, data: true } }),
  ]);
  const assessed = new Set(checks.map((c) => c.memberId));
  for (const m of neo) {
    if (!assessed.has(m.id)) continue;
    const d = plans.find((p) => p.memberId === m.id)?.data as ({ enc?: string } & PlanData) | undefined;
    let plan: PlanData | null = null;
    try { plan = d ? (d.enc !== undefined ? (JSON.parse(dec(d.enc)) as PlanData) : d) : null; } catch { plan = null; }
    if (!hasPlanContent(plan) || missingSections(plan).length > 0) return { id: m.id, name: m.name };
  }
  return null;
}

/** Η 2η ατομική του παραπάνω μέλους, σε 2 λεπτά, στην 5η θέση (όπως η 1η). */
export async function startDemoSecondSession(therapist: { id: string; therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null }): Promise<string | null> {
  const m = await demoSecondCandidate();
  if (!m) return null;
  return bookDemo(therapist, m.id, FIRST_POSITION);
}

async function bookDemo(therapist: { id: string; therapistKind: "BIOMATIC" | "CLINICAL" | "BOTH" | null }, memberId: string, position: number): Promise<string> {
  const now = new Date();
  const p = localParts(now);
  const startsAt = new Date(now.getTime() + 2 * 60_000);
  // Όχι δεύτερη δοκιμαστική ατομική όσο η προηγούμενη του ίδιου θεραπευτή δεν έχει τελειώσει (ή δεν έχει σημείωμα):
  // ξαναχρησιμοποιείται η ίδια (14/10, για να μη γεμίζει το πρόγραμμα με διπλές).
  const { getSettings } = await import("./settings");
  const minutes = (await getSettings()).sessionMinutes;
  const open = await prisma.slot.findFirst({
    where: { date: p.date, position: { in: [position, ...Array.from({ length: 30 }, (_, i) => 21 + i)] }, therapistId: therapist.id, kind: "INDIVIDUAL", note: null, startsAt: { gt: new Date(now.getTime() - minutes * 60_000) }, bookings: { some: { memberId } } },
    orderBy: { startsAt: "desc" },
    select: { id: true, startsAt: true },
  });
  if (open) {
    // Αν δεν έχει ξεκινήσει ακόμα, ξαναμπαίνει «σε 2 λεπτά»· αν τρέχει, μένει όπως είναι.
    if (open.startsAt > now) await prisma.slot.update({ where: { id: open.id }, data: { startsAt } });
    return open.id;
  }
  // Ελεύθερη θέση της ώρας: ποτέ θέση άλλου θεραπευτή ή με άλλο μέλος (16/10: δύο θεραπευτές την ίδια ώρα έφτιαχναν
  // κατά λάθος «Therapair» στην ίδια θέση). Η πρώτη δοκιμαστική είναι η 4η (Νίκος) / 5η (νέο μέλος)· αλλιώς από 21 και πάνω.
  const candidates = [position, ...Array.from({ length: 30 }, (_, i) => 21 + i)];
  const taken = await prisma.slot.findMany({ where: { date: p.date, hour: p.hour, position: { in: candidates } }, select: { position: true, therapistId: true, bookings: { select: { memberId: true } }, note: { select: { id: true } } } });
  // Θέση της ίδιας ώρας που έχει ήδη σημείωμα (π.χ. η 1η ατομική που μόλις ολοκληρώθηκε) δεν ξαναχρησιμοποιείται:
  // η επόμενη δοκιμαστική (17/10: «2η ατομική») μπαίνει σε άλλη θέση, αλλιώς θα έδειχνε το παλιό σημείωμα.
  const free = candidates.find((pos) => {
    const t = taken.find((x) => x.position === pos);
    return !t || (!t.note && t.therapistId === therapist.id && t.bookings.every((bk) => bk.memberId === memberId));
  });
  if (free === undefined) throw new Error("καμία ελεύθερη δοκιμαστική θέση");
  const slot = await prisma.slot.upsert({
    where: { date_hour_position: { date: p.date, hour: p.hour, position: free } },
    create: { date: p.date, hour: p.hour, position: free, kind: "INDIVIDUAL", startsAt, therapistId: therapist.id },
    update: { kind: "INDIVIDUAL", startsAt, therapistId: therapist.id, pairApprovedAt: null },
  });
  const existing = await prisma.booking.findUnique({ where: { slotId_memberId: { slotId: slot.id, memberId } }, select: { id: true } });
  const cycleId = existing ? undefined : await cycleForDemoBooking(prisma, memberId);
  await prisma.booking.upsert({
    where: { slotId_memberId: { slotId: slot.id, memberId } },
    create: { slotId: slot.id, memberId, cycleId, kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" },
    update: {},
  });
  return slot.id;
}

/** Στη δοκιμή: αν η σημερινή μέρα δεν έχει ραντεβού (δεν έγινε build σήμερα), μπαίνουν τα ψεύτικα της ημέρας. */
let ensuredFor = ""; // μία φορά ανά μέρα και διεργασία, για να μη βαραίνει κάθε άνοιγμα του «Σήμερα»
export async function ensureDemoToday(): Promise<void> {
  if (!isDemoSite()) return;
  const now = new Date();
  const today = localParts(now).date;
  // Ψεύτικα ραντεβού που τελείωσαν χωρίς σημείωμα σβήνονται κάθε φορά (17/10) — δεν μένει «Γράψε σημείωμα» από ψεύτικα.
  await cleanupDemoDay(prisma, today, now).catch(() => undefined);
  if (ensuredFor === today) return;
  await ensureDemoDay(prisma, today, now).then(() => { ensuredFor = today; }).catch(() => undefined);
}
