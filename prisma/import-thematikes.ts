// Εισαγωγή της θεματικής της εβδομάδας από αρχείο (υπεύθυνη 22/10: «όλα τα κείμενα, τις θεματικές και τις φόρμες τα κάνω
// μέσα από εδώ — θα μπορεί να γίνεται το ίδιο»). Τα αρχεία ζουν στο content/thematikes/*.json (μορφή: docs/odigies/
// thematiki-sto-apex.md) και μπαίνουν στη βάση σε κάθε ανέβασμα (netlify.toml). Τρέχει και τοπικά:
//   npx tsx prisma/import-thematikes.ts
// Κανόνες: ταυτότητα = (μέρα, είδος, τίτλος). Νέο → δημιουργείται. Υπάρχον → ενημερώνεται κείμενο/ερωτήσεις, ΕΚΤΟΣ αν η φόρμα
// έχει ήδη απαντήσεις μελών (τότε δεν αλλάζει τίποτα — οι απαντήσεις είναι δεμένες με τις ερωτήσεις). Τίποτα δεν σβήνεται.
// Αρχεία με "demo": true μπαίνουν μόνο στη δοκιμή (DEMO_SEED=1). Λάθος σε αρχείο = το build σταματά, για να μη χαθεί σιωπηλά.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const DIR = join(process.cwd(), "content", "thematikes");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const File = z.object({
  theme: z.string().trim().min(1),
  demo: z.boolean().optional(),
  forms: z.array(z.object({ date, title: z.string().trim().min(1), body: z.string().default(""), questions: z.array(z.string().trim().min(1)).min(1).max(30) })).default([]),
  texts: z.array(z.object({ date, title: z.string().trim().min(1), body: z.string().default("") })).default([]),
});

async function main() {
  if (!existsSync(DIR)) return;
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  let created = 0, updated = 0, kept = 0;
  for (const f of files) {
    const parsed = File.safeParse(JSON.parse(readFileSync(join(DIR, f), "utf8")));
    if (!parsed.success) throw new Error(`[θεματικές] ${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const t = parsed.data;
    if (t.demo && process.env.DEMO_SEED !== "1") continue;
    const items = [
      ...t.forms.map((x) => ({ kind: "FORM" as const, date: x.date, title: x.title, body: x.body, questions: JSON.stringify(x.questions) })),
      ...t.texts.map((x) => ({ kind: "DAILY_TEXT" as const, date: x.date, title: x.title, body: x.body, questions: "" })),
    ];
    for (const it of items) {
      const ex = await prisma.content.findFirst({ where: { date: it.date, kind: it.kind, title: it.title }, select: { id: true, body: true, questions: true } });
      if (!ex) {
        await prisma.content.create({ data: { ...it, url: null } });
        created++;
      } else if (ex.body === it.body && ex.questions === it.questions) {
        kept++;
      } else if (it.kind === "FORM" && (await prisma.formAnswer.count({ where: { contentId: ex.id } })) > 0) {
        console.log(`[θεματικές] ${f}: «${it.title}» έχει ήδη απαντήσεις — δεν αλλάζει.`);
        kept++;
      } else {
        await prisma.content.update({ where: { id: ex.id }, data: { body: it.body, questions: it.questions } });
        updated++;
      }
    }
  }
  console.log(`[θεματικές] ${files.length} αρχεία · νέα ${created} · ενημερωμένα ${updated} · ίδια ${kept}`);
}

main().finally(() => prisma.$disconnect());
