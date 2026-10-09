// Ψεύτικα ραντεβού για ΣΗΜΕΡΑ, ώστε το «Σήμερα» του θεραπευτή να μη φαίνεται άδειο στη δοκιμή.
// Τρέχει μόνο αν DEMO_SEED=1, μόνο σε βάση με τα ψεύτικα στοιχεία (υπάρχει ο «eva»),
// και μόνο αν η σημερινή μέρα δεν έχει ήδη κανένα ραντεβού.
//   DEMO_SEED=1 npx tsx prisma/demo-today.ts
import { PrismaClient } from "@prisma/client";
import { athensToUtc, localParts } from "../src/lib/time";

const prisma = new PrismaClient();

// Ποιος βλέπει ποιον: ώρα, θεραπευτής (θέση = δωμάτιο), μέλη. Δύο μέλη = Therapair.
const PLAN: { hour: number; therapist: string; position: number; members: string[] }[] = [
  { hour: 12, therapist: "dimitra", position: 3, members: ["nikos"] },
  { hour: 13, therapist: "anna", position: 1, members: ["eleni"] },
  { hour: 14, therapist: "vasilis", position: 2, members: ["giorgos"] },
  { hour: 15, therapist: "dimitra", position: 3, members: ["sofia", "petros"] },
];

async function main() {
  if (process.env.DEMO_SEED !== "1") return;
  if (!(await prisma.user.findUnique({ where: { username: "eva" } }))) return;
  const today = localParts(new Date()).date;
  if (await prisma.booking.findFirst({ where: { slot: { date: today } } })) {
    console.log(`[demo-today] Η ${today} έχει ήδη ραντεβού· δεν προστίθεται τίποτα.`);
    return;
  }
  for (const p of PLAN) {
    const therapist = await prisma.user.findUnique({ where: { username: p.therapist } });
    const members = await prisma.user.findMany({ where: { username: { in: p.members } } });
    if (!therapist || members.length !== p.members.length) continue;
    const pair = members.length === 2;
    const slot =
      (await prisma.slot.findFirst({ where: { date: today, hour: p.hour, position: p.position } })) ??
      (await prisma.slot.create({
        data: { date: today, hour: p.hour, position: p.position, therapistId: therapist.id, startsAt: athensToUtc(today, p.hour) },
      }));
    await prisma.slot.update({
      where: { id: slot.id },
      data: { therapistId: therapist.id, kind: pair ? "PAIR" : "INDIVIDUAL", pairApprovedAt: pair ? new Date() : null },
    });
    for (const m of members) {
      const cycle = await prisma.cycle.findFirst({ where: { memberId: m.id, closedAt: null }, orderBy: { startedAt: "desc" } });
      await prisma.booking.create({
        data: { slotId: slot.id, memberId: m.id, cycleId: cycle?.id, kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" },
      });
    }
  }
  console.log(`[demo-today] Ραντεβού για ${today}: ${PLAN.length} θέσεις.`);
}

main().finally(() => prisma.$disconnect());
