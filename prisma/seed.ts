// Δημιουργεί τον πρώτο λογαριασμό διαχείρισης (Εύα). Τρέχει μία φορά:
//   ADMIN_USERNAME=eva ADMIN_NAME="Εύα" npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "eva").toLowerCase();
  const name = process.env.ADMIN_NAME ?? "Εύα";
  if (await prisma.user.findUnique({ where: { username } })) {
    console.log(`Ο χρήστης ${username} υπάρχει ήδη.`);
    return;
  }
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = process.env.ADMIN_CODE ?? Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
  await prisma.user.create({
    data: { username, name, role: "ADMIN", passwordHash: await bcrypt.hash(code, 12) },
  });
  console.log(`Δημιουργήθηκε: ${username} / ${code}  (κράτησέ τον — δεν ξαναεμφανίζεται)`);
}

main().finally(() => prisma.$disconnect());
