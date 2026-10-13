import "server-only";
import { prisma } from "./db";
import { cycleForDemoBooking, ensureDemoDay } from "./demo-day";
import { localParts } from "./time";

/** Δοκιμαστική εγκατάσταση (Netlify, ψεύτικα στοιχεία): εκεί υπάρχει DEMO_SEED=1. */
export const isDemoSite = (): boolean => process.env.DEMO_SEED === "1";

const DEMO_MEMBER = "nikos";
const DEMO_POSITION = 4; // 4ο δωμάτιο: δεν το χρησιμοποιούν τα ψεύτικα ραντεβού της ημέρας (1–3)

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
  const now = new Date();
  const p = localParts(now);
  const startsAt = new Date(now.getTime() + 2 * 60_000);
  const slot = await prisma.slot.upsert({
    where: { date_hour_position: { date: p.date, hour: p.hour, position: DEMO_POSITION } },
    create: { date: p.date, hour: p.hour, position: DEMO_POSITION, kind: "INDIVIDUAL", startsAt, therapistId: therapist.id },
    update: { kind: "INDIVIDUAL", startsAt, therapistId: therapist.id, pairApprovedAt: null },
  });
  const existing = await prisma.booking.findUnique({ where: { slotId_memberId: { slotId: slot.id, memberId: member.id } }, select: { id: true } });
  const cycleId = existing ? undefined : await cycleForDemoBooking(prisma, member.id);
  await prisma.booking.upsert({
    where: { slotId_memberId: { slotId: slot.id, memberId: member.id } },
    create: { slotId: slot.id, memberId: member.id, cycleId, kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" },
    update: {},
  });
  return slot.id;
}

/** Στη δοκιμή: αν η σημερινή μέρα δεν έχει ραντεβού (δεν έγινε build σήμερα), μπαίνουν τα ψεύτικα της ημέρας. */
let ensuredFor = ""; // μία φορά ανά μέρα και διεργασία, για να μη βαραίνει κάθε άνοιγμα του «Σήμερα»
export async function ensureDemoToday(): Promise<void> {
  if (!isDemoSite()) return;
  const today = localParts(new Date()).date;
  if (ensuredFor === today) return;
  await ensureDemoDay(prisma, today).then(() => { ensuredFor = today; }).catch(() => undefined);
}
