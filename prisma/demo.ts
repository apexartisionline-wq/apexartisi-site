// Δοκιμαστικά (ψεύτικα) στοιχεία για να δει κανείς την εφαρμογή χωρίς πραγματικά μέλη.
// Τρέχει μόνο αν DEMO_SEED=1 και μόνο σε άδεια βάση (αν υπάρχει ήδη ο χρήστης «eva», δεν κάνει τίποτα).
// Όλοι οι λογαριασμοί έχουν τον ίδιο κωδικό: DEMO_PASSWORD.
//   DEMO_SEED=1 DEMO_PASSWORD=... npx tsx prisma/demo.ts
import { PrismaClient, type TherapistKind, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS, settingsSchema } from "../src/lib/settings";
import { addDays, athensToUtc, localParts, weekdayOf } from "../src/lib/time";

const prisma = new PrismaClient();
const VERSION = "δοκιμή";

async function main() {
  if (process.env.DEMO_SEED !== "1") return;
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("Χρειάζεται DEMO_PASSWORD (τουλάχιστον 8 χαρακτήρες).");
  if (await prisma.user.findUnique({ where: { username: "eva" } })) {
    console.log("[demo] Η βάση έχει ήδη στοιχεία· δεν προστίθεται τίποτα.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const eva = await prisma.user.create({
    data: { username: "eva", name: "Εύα (δοκιμή)", role: "ADMIN", therapistKind: "BIOMATIC", passwordHash },
  });
  const therapists: [string, string, TherapistKind][] = [
    ["anna", "Άννα Κ. (ψυχολόγος)", "CLINICAL"],
    ["vasilis", "Βασίλης Μ. (βιωματικός)", "BIOMATIC"],
    ["dimitra", "Δήμητρα Λ. (ψυχολόγος)", "BOTH"],
  ];
  const staff: User[] = [];
  for (const [username, name, therapistKind] of therapists) {
    staff.push(await prisma.user.create({ data: { username, name, role: "THERAPIST", therapistKind, passwordHash, phone: "6900000000" } }));
  }

  const today = localParts(new Date()).date;
  const members: [string, string, string, boolean][] = [
    ["nikos", "Νίκος Δοκιμαστικός", "A-10001", true],
    ["eleni", "Ελένη Δοκιμαστική", "A-10002", true],
    ["giorgos", "Γιώργος Δοκιμαστικός", "A-10003", true],
    ["maria", "Μαρία Δοκιμαστική", "A-10004", false], // νέο μέλος: έναρξη συνεργασίας σε εκκρεμότητα
  ];
  const created: User[] = [];
  for (const [username, name, memberCode, intakeDone] of members) {
    const m = await prisma.user.create({
      data: {
        username, name, memberCode, role: "MEMBER", source: "APEX", passwordHash, phone: "6900000000",
        programStartDate: intakeDone ? addDays(today, -20) : today,
      },
    });
    created.push(m);
    await prisma.cycle.create({ data: { memberId: m.id, length: 8 } });
    if (!intakeDone) continue;
    for (const key of ["online_consent", "agreement", "assessment", "risk", "safety_plan"]) {
      await prisma.intakeCheck.create({
        data: { memberId: m.id, key, value: key === "risk" ? "LOW" : null, doneById: staff[0].id },
      });
    }
    for (const purpose of ["record", "journal", "forms", "telegram", "self_message", "emergency_contact", "confidentiality"]) {
      await prisma.consent.create({
        data: { memberId: m.id, purpose, choice: "YES", version: VERSION, recordedById: purpose === "confidentiality" ? m.id : staff[0].id },
      });
    }
    for (let d = 1; d <= 5; d++) {
      await prisma.attendance.create({ data: { memberId: m.id, date: addDays(today, -2 * d) } });
    }
  }

  // Θέσεις ατομικών: Τρίτη και Πέμπτη, 09:00–17:00, τρία δωμάτια, για τις επόμενες δύο εβδομάδες.
  const slotTherapists = [staff[0], staff[1], staff[2]];
  for (let i = -7; i <= 14; i++) {
    const date = addDays(today, i);
    if (![2, 4].includes(weekdayOf(date))) continue;
    for (let hour = 9; hour <= 17; hour++) {
      for (let position = 1; position <= 3; position++) {
        await prisma.slot.create({
          data: { date, hour, position, therapistId: slotTherapists[position - 1].id, startsAt: athensToUtc(date, hour) },
        });
      }
    }
  }
  // Μια παλιά και μια επόμενη ατομική για τα μέλη με ολοκληρωμένη έναρξη.
  const slots = await prisma.slot.findMany({ orderBy: { startsAt: "asc" }, include: { therapist: true } });
  const past = slots.filter((s) => s.startsAt < new Date());
  const future = slots.filter((s) => s.startsAt > new Date());
  for (const [i, m] of created.slice(0, 3).entries()) {
    const cycle = await prisma.cycle.findFirstOrThrow({ where: { memberId: m.id } });
    for (const s of [past[past.length - 1 - i * 3], future[i * 4]]) {
      if (!s) continue;
      await prisma.booking.create({
        data: { slotId: s.id, memberId: m.id, cycleId: cycle.id, kind: s.therapist?.therapistKind === "BIOMATIC" ? "BIOMATIC" : "CLINICAL" },
      });
    }
  }

  const settings = settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    orgName: "APEX-ARTISI ONLINE (δοκιμή)",
    requireStaff2FA: false,
    consentVersion: VERSION,
    groupRoomUrl: "https://zoom.us/",
    rooms: ["https://zoom.us/", "https://zoom.us/", "https://zoom.us/", "https://zoom.us/"],
    groups: DEFAULT_SETTINGS.groups.map((g, i) => ({ ...g, rotation: [staff[i % staff.length].id] })),
  });
  await prisma.setting.upsert({ where: { key: "app" }, create: { key: "app", value: settings }, update: { value: settings } });

  console.log(`[demo] Έτοιμο. Λογαριασμοί (κωδικός: DEMO_PASSWORD):
  Εύα: eva · θεραπευτές: anna, vasilis, dimitra · μέλη: nikos, eleni, giorgos, maria (νέο μέλος)`);
  void eva;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
