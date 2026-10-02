// Ψεύτικο ιστορικό για τη δοκιμή: παλιές ατομικές με σημειώματα από διαφορετικούς θεραπευτές,
// ένα πάτημα κόκκινου κουμπιού, πλάνο ασφάλειας και σύνοψη περίπτωσης.
// Τρέχει μόνο αν DEMO_SEED=1 και δεν υπάρχει ήδη σύνοψη περίπτωσης (μία φορά).
//   DEMO_SEED=1 npx tsx prisma/demo-history.ts
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { enc } from "../src/lib/crypto-core";
import { addDays, athensToUtc, localParts } from "../src/lib/time";

const DAY = 24 * 3600_000;

type N = { daysAgo: number; t: string; text: string; risk: "UP" | "SAME" | "DOWN"; used: "YES" | "NO" | "UNKNOWN"; next: string };

const HISTORY: Record<string, N[]> = {
  nikos: [
    { daysAgo: 33, t: "anna", risk: "SAME", used: "NO", next: "Να γράψει 3 καταστάσεις που τον δυσκολεύουν.", text: "Πρώτη ατομική μετά την έναρξη. Στόχος η αποχή από αλκοόλ. Αναφέρει δυσκολία τα βράδια Παρασκευής με την παλιά παρέα." },
    { daysAgo: 26, t: "vasilis", risk: "DOWN", used: "NO", next: "Συνέχεια με το περπάτημα· να μιλήσει στην αδερφή του.", text: "Έφερε τη λίστα. Το περπάτημα μετά τη δουλειά βοηθά. Καλύτερος ύπνος. Θέμα με την οικογένεια: νιώθει ότι δεν τον εμπιστεύονται ακόμα." },
    { daysAgo: 19, t: "dimitra", risk: "SAME", used: "NO", next: "Σχέδιο για τη γιορτή του Σαββάτου.", text: "Μίλησε στην αδερφή του, πήγε καλά. Άγχος για γιορτή φίλου το Σάββατο. Κάναμε πλάνο: φεύγει νωρίς, έχει μαζί του αναψυκτικό, τηλέφωνο στην αδερφή." },
    { daysAgo: 12, t: "anna", risk: "SAME", used: "NO", next: "Να έρθει στην πρωινή ομάδα της Τρίτης.", text: "Η γιορτή πέρασε χωρίς χρήση, έφυγε νωρίς όπως είχαμε πει. Υπερηφάνεια. Λιγότερη συμμετοχή στις ομάδες λόγω βάρδιας." },
  ],
  eleni: [
    { daysAgo: 30, t: "vasilis", risk: "SAME", used: "NO", next: "Δουλειά στο πλάνο ασφάλειας στην επόμενη.", text: "Στόχος αποχή από οπιοειδή, 4 μήνες καθαρή. Ζει μόνη. Μοναξιά τα Σαββατοκύριακα." },
    { daysAgo: 16, t: "anna", risk: "UP", used: "NO", next: "Τηλέφωνο σε 2 μέρες. Το πλάνο ασφάλειας εκκρεμεί.", text: "Δύσκολη εβδομάδα: απώλεια δουλειάς. Έντονη λαχτάρα, σκέψεις ότι «δεν αξίζει». Χωρίς σχέδιο ή πρόθεση. Συμφωνήσαμε τηλέφωνο και κόκκινο κουμπί αν χρειαστεί." },
    { daysAgo: 5, t: "dimitra", risk: "SAME", used: "NO", next: "Πλάνο ασφάλειας στην επόμενη, οπωσδήποτε.", text: "Πάτησε το κόκκινο κουμπί πριν από λίγες μέρες, μίλησε με θεραπευτή, βοήθησε. Καλύτερα σήμερα. Ψάχνει δουλειά." },
  ],
  giorgos: [
    { daysAgo: 24, t: "dimitra", risk: "SAME", used: "NO", next: "Να καταγράφει τις ώρες που τον πιάνει λαχτάρα.", text: "Στόχος αποχή από κοκαΐνη. Δουλεύει σε μπαρ, αυτό είναι ο μεγαλύτερος κίνδυνος." },
    { daysAgo: 10, t: "vasilis", risk: "SAME", used: "UNKNOWN", next: "Να σκεφτεί αλλαγή βάρδιας.", text: "Αποφεύγει να απαντήσει για το Σαββατοκύριακο. Κουρασμένος. Δεν πίεσα· το ξαναπιάνουμε." },
    { daysAgo: 4, t: "anna", risk: "UP", used: "YES", next: "Ξανά ατομική σε 3 μέρες· να ενημερωθεί η Εύα.", text: "Είπε ανοιχτά ότι έκανε χρήση την Παρασκευή στη δουλειά. Ντροπή, αλλά ήρθε και το είπε. Ευχαριστήσαμε που το είπε. Μιλήσαμε για αλλαγή δουλειάς." },
  ],
};

export async function seedHistory(prisma: PrismaClient): Promise<string> {
  if (process.env.DEMO_SEED !== "1") return "DEMO_SEED δεν είναι 1";
  if ((await prisma.caseSummary.count()) > 0) {
    return "Υπάρχει ήδη ιστορικό· δεν προστίθεται τίποτα.";
  }
  const users = await prisma.user.findMany({ where: { username: { in: ["eva", "anna", "vasilis", "dimitra", "nikos", "eleni", "giorgos"] } } });
  const u = (name: string) => {
    const x = users.find((y) => y.username === name);
    if (!x) throw new Error(`Λείπει ο χρήστης ${name} (τρέξε πρώτα το demo.ts)`);
    return x;
  };
  const now = new Date();
  const today = localParts(now).date;

  for (const [member, notes] of Object.entries(HISTORY)) {
    const m = u(member);
    const cycle = await prisma.cycle.findFirst({ where: { memberId: m.id } });
    for (const [i, n] of notes.entries()) {
      const date = addDays(today, -n.daysAgo);
      const hour = 18;
      const position = 4 + Object.keys(HISTORY).indexOf(member); // εκτός των θέσεων 1–3 του demo.ts
      const startsAt = athensToUtc(date, hour);
      const therapist = u(n.t);
      const slot = await prisma.slot.create({ data: { date, hour, position, startsAt, therapistId: therapist.id } });
      await prisma.booking.create({
        data: {
          slotId: slot.id, memberId: m.id, cycleId: cycle?.id, joinedAt: startsAt, durationMinutes: 45 + i,
          kind: therapist.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL",
        },
      });
      await prisma.sessionNote.create({
        data: { slotId: slot.id, therapistId: therapist.id, content: enc(n.text), riskChange: n.risk, usedSince: n.used, nextStep: enc(n.next) },
      });
    }
  }

  // Κόκκινο κουμπί της Ελένης πριν από 7 μέρες, με έκβαση.
  const eleni = u("eleni");
  const at = new Date(now.getTime() - 7 * DAY);
  await prisma.helpRequest.create({
    data: {
      memberId: eleni.id, createdAt: at, lastNotifiedAt: at, claimedById: u("vasilis").id, claimedByName: "Βασίλης Μ. (βιωματικός)",
      claimedAt: new Date(at.getTime() + 4 * 60_000), talkedAt: new Date(at.getTime() + 30 * 60_000),
      resolvedAt: new Date(at.getTime() + 30 * 60_000), outcome: "Μιλήσαμε 25′, ηρέμησε, θα έρθει στην ομάδα αύριο.",
    },
  });

  // Πλάνο ασφάλειας και σύνοψη περίπτωσης για τον Νίκο.
  const nikos = u("nikos");
  await prisma.safetyPlan.upsert({
    where: { memberId: nikos.id },
    create: {
      memberId: nikos.id, updatedById: u("anna").id,
      data: { enc: enc(JSON.stringify({ warningSigns: "Παρασκευή βράδυ, μοναξιά, παλιά παρέα", myCoping: "Περπάτημα, ντους, μουσική", helpers: "Αδερφή (ψεύτικο 6900000000)", reasons: "Η κόρη μου" })) },
    },
    update: {},
  });
  await prisma.caseSummary.create({
    data: {
      memberId: nikos.id, authorId: u("anna").id,
      content: enc(JSON.stringify({
        goal: "Αλκοόλ · αποχή",
        triggers: "Παρασκευή βράδυ με την παλιά παρέα· γιορτές· βάρδιες που τον κουράζουν",
        helps: "Περπάτημα μετά τη δουλειά· τηλέφωνο στην αδερφή του· να φεύγει νωρίς από εκδηλώσεις",
        notHelps: "Να του λένε «μην πας πουθενά»· νιώθει τιμωρία",
        open: "Σχέσεις με την οικογένεια (εμπιστοσύνη)· συμμετοχή στις ομάδες με τη βάρδια",
        next: "Ρώτα για την πρωινή ομάδα της Τρίτης. Του κάνει καλό να αναγνωρίζεται η πρόοδος.",
      })),
    },
  });
  return "Έτοιμο: σημειώματα για nikos, eleni, giorgos · κόκκινο κουμπί (eleni) · σύνοψη (nikos).";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const prisma = new PrismaClient();
  seedHistory(prisma)
    .then((msg) => console.log(`[demo-history] ${msg}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
