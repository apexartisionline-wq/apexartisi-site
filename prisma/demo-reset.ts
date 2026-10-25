// Καθαρισμός ψεύτικων δεδομένων σε κάθε ανέβασμα (υπεύθυνη 17/10: «θέλω να βγάλεις τα παλιά δεδομένα — σε κάθε αναβάθμιση
// θα βάζεις νέα δεδομένα για να καταλαβαίνω»). Τρέχει ΠΡΩΤΟ στο build της δοκιμής (netlify.toml), μόνο με DEMO_SEED=1 και
// μόνο σε βάση δοκιμής (υπάρχει ο «eva»). Σβήνει:
//   1. κάθε συνεδρία του ΠΑΡΕΛΘΟΝΤΟΣ χωρίς σημείωμα (ατομική χωρίς σημείωμα, Therapair χωρίς σημειώματα) με ψεύτικα μέλη —
//      ώστε να μη μένει πουθενά «Γράψε σημείωμα» / «εκκρεμεί καταγραφή» από παλιά δοκιμή·
//   2. τα μέλη της «Δοκιμαστικής 1ης ατομικής» (username neo-…) και τα προσωρινά μέλη των σεναρίων ελέγχου (tmp…), μαζί με
//      ό,τι τους ανήκει (κρατήσεις, κύκλοι, σημειώματα — cascade)·
//   3. θέσεις που έμειναν χωρίς κράτηση στο παρελθόν.
// Δεν αγγίζει: σημειώματα, ιστορικό, λογαριασμούς που έφτιαξε η διαχείριση (μόνο οι ψεύτικοι λογαριασμοί του seed).
// Μετά τρέχουν τα υπόλοιπα seeds (demo, demo-history, demo-journal, demo-steps, demo-today) και ξαναβάζουν φρέσκα δεδομένα.
//   DEMO_SEED=1 npx tsx prisma/demo-reset.ts
import { PrismaClient } from "@prisma/client";
import { DEMO_DAY_USERNAMES } from "../src/lib/demo-day";

const prisma = new PrismaClient();
// Οι 8 ψεύτικοι λογαριασμοί του seed (prisma/demo.ts) + τα ψεύτικα μέλη των ραντεβού της ημέρας.
const SEED_USERNAMES = ["eva", "anna", "vasilis", "dimitra", "nikos", "eleni", "giorgos", "maria", "stavros", ...DEMO_DAY_USERNAMES];

async function main() {
  if (process.env.DEMO_SEED !== "1") return;
  if (!(await prisma.user.findUnique({ where: { username: "eva" }, select: { id: true } }))) { console.log("[demo-reset] όχι βάση δοκιμής· τίποτα."); return; }
  const now = new Date();
  // 2. Προσωρινά μέλη των δοκιμών (και ό,τι τους ανήκει).
  const temp = await prisma.user.deleteMany({ where: { role: "MEMBER", OR: [{ username: { startsWith: "neo-" } }, { username: { startsWith: "tmp" } }, { username: { startsWith: "wel" } }] } });
  // 1. Συνεδρίες του παρελθόντος χωρίς σημείωμα, όπου όλα τα μέλη είναι ψεύτικα του seed (ή η θέση έμεινε χωρίς κράτηση).
  const past = await prisma.slot.findMany({
    where: { startsAt: { lt: now }, note: null, pairNotes: { none: {} } },
    select: { id: true, bookings: { select: { member: { select: { username: true } } } } },
  });
  const ids = past.filter((s) => s.bookings.every((b) => SEED_USERNAMES.includes(b.member.username))).map((s) => s.id);
  const slots = ids.length ? await prisma.slot.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };
  console.log(`[demo-reset] σβήστηκαν: ${slots.count} παλιές συνεδρίες χωρίς σημείωμα, ${temp.count} προσωρινά μέλη.`);
}

main().finally(() => prisma.$disconnect());
