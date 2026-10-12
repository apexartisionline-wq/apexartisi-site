// Ψεύτικα ραντεβού για ΣΗΜΕΡΑ, ώστε το «Σήμερα» του θεραπευτή να μη φαίνεται άδειο στη δοκιμή.
// Τρέχει μόνο αν DEMO_SEED=1, μόνο σε βάση με τα ψεύτικα στοιχεία (υπάρχει ο «eva»),
// και μόνο αν η σημερινή μέρα δεν έχει ήδη κανένα ραντεβού. Η λογική είναι στο src/lib/demo-day.ts
// (την καλεί και το «Σήμερα» της δοκιμής, για τις μέρες χωρίς build).
//   DEMO_SEED=1 npx tsx prisma/demo-today.ts
import { PrismaClient } from "@prisma/client";
import { ensureDemoDay } from "../src/lib/demo-day";
import { localParts } from "../src/lib/time";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DEMO_SEED !== "1") return;
  const today = localParts(new Date()).date;
  const added = await ensureDemoDay(prisma, today);
  console.log(added ? `[demo-today] Ραντεβού για ${today}: έτοιμα.` : `[demo-today] Η ${today} έχει ήδη ραντεβού (ή δεν είναι βάση δοκιμής)· δεν προστίθεται τίποτα.`);
}

main().finally(() => prisma.$disconnect());
