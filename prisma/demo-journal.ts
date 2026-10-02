// Ψεύτικα στοιχεία για τη δοκιμή: απογραφές (ημερολόγιο ανάκαμψης) 10 ημερών, ημερομηνίες
// νηφαλιότητας, μία εργασία και οι 3 φόρμες της θεματικής της εβδομάδας.
// Τρέχει μόνο αν DEMO_SEED=1 και δεν υπάρχει ακόμα καμία απογραφή.
//   DEMO_SEED=1 npx tsx prisma/demo-journal.ts
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { enc } from "../src/lib/crypto-core";
import { addDays, localParts } from "../src/lib/time";

// Λαχτάρα/ύπνος ανά μέρα (παλιότερη → σημερινή)· null = δεν έγραψε.
const PATTERNS: Record<string, { sober: number; days: ([number, number, number] | null)[] }> = {
  // [λαχτάρα, ύπνος, διάθεση]
  nikos: { sober: 58, days: [[2, 7.5, 7], [3, 7, 7], [2, 7.5, 7], [3, 7, 6], [7, 5, 4], [8, 4.5, 4], null, [3, 7, 6], [2, 7.5, 7], [2, 8, 7]] },
  eleni: { sober: 130, days: [[5, 6, 4], [6, 5, 3], null, null, [7, 5, 3], null, [8, 4, 2], null, null, [6, 5, 3]] },
  giorgos: { sober: 4, days: [[4, 6, 5], [5, 6, 5], null, [6, 5, 4], null, null, [8, 4, 3], [5, 6, 4], null, [4, 6, 5]] },
};

export async function seedJournal(prisma: PrismaClient): Promise<string> {
  if (process.env.DEMO_SEED !== "1") return "DEMO_SEED δεν είναι 1";
  if ((await prisma.journalEntry.count()) > 0) return "Υπάρχουν ήδη απογραφές· δεν προστίθεται τίποτα.";
  const today = localParts(new Date()).date;
  for (const [username, p] of Object.entries(PATTERNS)) {
    const m = await prisma.user.findUnique({ where: { username } });
    if (!m) continue;
    await prisma.user.update({ where: { id: m.id }, data: { soberSince: addDays(today, -p.sober) } });
    for (const [i, d] of p.days.entries()) {
      if (!d) continue;
      const [craving, sleepHours, mood] = d;
      // Συνέπεια με τον στόχο της εβδομάδας (ψεύτικα): καλύτερη όταν η λαχτάρα είναι χαμηλή.
      const goalCheck = craving <= 3 ? "YES" : craving <= 6 ? "PARTLY" : "NO";
      await prisma.journalEntry.create({
        data: { memberId: m.id, date: addDays(today, i - p.days.length + 1), craving, sleepHours, mood, confidence: Math.max(0, 10 - craving), selfHarm: "NO", used: false, goalCheck },
      });
    }
  }
  // Στόχοι εβδομάδας (ψεύτικοι), με τα λόγια του μέλους.
  const goals: Record<string, string> = { nikos: "Να μιλάω όταν ντρέπομαι, αντί να κλείνομαι", eleni: "Να πάω σε 4 ομάδες", giorgos: "Να μην απαντάω θυμωμένα στο σπίτι" };
  const wd0 = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  for (const [username, text] of Object.entries(goals)) {
    const m = await prisma.user.findUnique({ where: { username } });
    if (m) await prisma.weeklyGoal.create({ data: { memberId: m.id, week: addDays(today, -wd0), text: enc(text) } });
  }
  const eva = await prisma.user.findUnique({ where: { username: "eva" } });
  const nikos = await prisma.user.findUnique({ where: { username: "nikos" } });
  if (eva && nikos) {
    await prisma.assignment.create({ data: { memberId: nikos.id, title: "Βήμα 2 · φύλλο εργασίας", instructions: "Απάντησε τις ερωτήσεις 1–9.", createdById: eva.id } });
  }
  // Φόρμες της θεματικής «Πίστη» για την τρέχουσα εβδομάδα (Δευτέρα, Τετάρτη, Παρασκευή).
  const wd = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -wd);
  for (const [i, title] of ["Πίστη: τι εμπιστεύομαι", "Πίστη: φόβος και εμπιστοσύνη", "Πίστη: παράδοση"].entries()) {
    await prisma.content.create({ data: { date: addDays(monday, i * 2), kind: "FORM", title, url: "https://forms.gle/" } });
  }
  return "Έτοιμο: απογραφές, στόχοι εβδομάδας, νηφαλιότητα, εργασία, φόρμες θεματικής.";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const prisma = new PrismaClient();
  seedJournal(prisma)
    .then((msg) => console.log(`[demo-journal] ${msg}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
