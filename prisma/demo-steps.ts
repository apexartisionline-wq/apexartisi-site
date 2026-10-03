// Ψεύτικα στοιχεία για τη δοκιμή: σε ποιο βήμα λένε ότι είναι τα μέλη και ένα βήμα από τη διαχείριση.
// Τρέχει μόνο αν DEMO_SEED=1 και δεν υπάρχει ακόμα καμία δήλωση βήματος.
//   DEMO_SEED=1 npx tsx prisma/demo-steps.ts
import { PrismaClient } from "@prisma/client";

const STEPS: Record<string, { step: number; title: string; done: boolean }> = {
  nikos: { step: 3, title: "ΔΟΚΙΜΗ: ερωτήσεις του βήματος", done: false },
  eleni: { step: 2, title: "ΔΟΚΙΜΗ: ερωτήσεις του βήματος", done: true },
  giorgos: { step: 1, title: "ΔΟΚΙΜΗ: ερωτήσεις του βήματος", done: false },
};

async function main() {
  const prisma = new PrismaClient();
  try {
    if (process.env.DEMO_SEED !== "1") return console.log("[demo-steps] DEMO_SEED δεν είναι 1");
    if ((await prisma.memberStep.count()) > 0) return console.log("[demo-steps] Υπάρχουν ήδη βήματα· τίποτα.");
    const eva = await prisma.user.findUnique({ where: { username: "eva" } });
    if (!eva) return console.log("[demo-steps] Δεν υπάρχει η διαχείριση.");
    for (const [username, s] of Object.entries(STEPS)) {
      const m = await prisma.user.findUnique({ where: { username } });
      if (!m) continue;
      await prisma.memberStep.create({ data: { memberId: m.id, step: s.step, byId: m.id } });
      await prisma.assignment.create({
        data: { memberId: m.id, step: s.step, title: s.title, instructions: "ΔΟΚΙΜΗ — εδώ μπαίνουν οι ερωτήσεις του βήματος που στέλνει η διαχείριση.", createdById: eva.id, answeredAt: s.done ? new Date() : null },
      });
    }
    console.log("[demo-steps] Έτοιμο.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
