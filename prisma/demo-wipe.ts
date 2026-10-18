// Πλήρης μηδενισμός των δεδομένων της ΔΟΚΙΜΗΣ (υπεύθυνη 18/10: «μηδένισε τα δεδομένα μέσα στην εφαρμογή»).
// Τρέχει ΠΡΩΤΟ στο build της δοκιμής (netlify.toml), μόνο με DEMO_SEED=1, μόνο σε βάση δοκιμής (υπάρχει ο «eva»), και
// ΜΙΑ ΦΟΡΑ ανά κλειδί: η τιμή της μεταβλητής DEMO_WIPE (π.χ. «2026-10-18a») γράφεται στο Setting «demo_wipe» και τα επόμενα
// builds με την ίδια τιμή δεν ξανασβήνουν τίποτα. Για νέο μηδενισμό: νέα τιμή στο DEMO_WIPE του Netlify + build.
// Σβήνει ΟΛΟΥΣ τους πίνακες με δεδομένα μελών και λειτουργίας (TRUNCATE … CASCADE) και όλα τα μέλη.
// Κρατά: Setting (Ρυθμίσεις: ομάδες, δωμάτια, ώρες), λογαριασμούς προσωπικού (διαχείριση, θεραπευτές — τους ξανακλειδώνει
// μετά το demo.ts στο DEMO_PASSWORD), το έντυπο εχεμύθειας και τις αποδοχές του (StaffDocument, StaffConsent), migrations.
// Μετά τρέχουν τα υπόλοιπα seeds και ξαναβάζουν φρέσκα ψεύτικα μέλη, ιστορικό, ημερολόγιο, βήματα, ραντεβού.
//   DEMO_SEED=1 DEMO_WIPE=<κλειδί> npx tsx prisma/demo-wipe.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEEP = new Set(["_prisma_migrations", "Setting", "User", "StaffDocument", "StaffConsent"]);

async function main() {
  const key = process.env.DEMO_WIPE?.trim();
  if (process.env.DEMO_SEED !== "1" || !key) return;
  if (!(await prisma.user.findUnique({ where: { username: "eva" }, select: { id: true } }))) { console.log("[demo-wipe] όχι βάση δοκιμής· τίποτα."); return; }
  const done = await prisma.setting.findUnique({ where: { key: "demo_wipe" } });
  if (done && (done.value as { key?: string } | null)?.key === key) { console.log(`[demo-wipe] το κλειδί «${key}» έχει ήδη τρέξει· τίποτα.`); return; }
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  const members = await prisma.user.deleteMany({ where: { role: "MEMBER" } });
  await prisma.setting.upsert({ where: { key: "demo_wipe" }, create: { key: "demo_wipe", value: { key, at: new Date().toISOString() } }, update: { value: { key, at: new Date().toISOString() } } });
  console.log(`[demo-wipe] μηδενίστηκαν ${tables.length} πίνακες και ${members.count} μέλη (κλειδί «${key}»). Κρατήθηκαν: Ρυθμίσεις, προσωπικό, εχεμύθεια.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
