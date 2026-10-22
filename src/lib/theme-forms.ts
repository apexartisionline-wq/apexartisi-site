// Φόρμες της θεματικής ΜΕΣΑ στο Apex (υπεύθυνη 22/10: «οι άνθρωποι θα μπαίνουν στις θεματικές και θα βλέπουν τις απαντήσεις
// από τις φόρμες τους»). Οι ερωτήσεις ζουν στο Content.questions (JSON πίνακας κειμένων)· οι απαντήσεις στο FormAnswer,
// κρυπτογραφημένες, με μία νέα γραμμή σε κάθε αποθήκευση (νέα έκδοση — τίποτα δεν σβήνεται μέσα στον χρόνο τήρησης).
// Παλιές φόρμες με σύνδεσμο (Google Forms) μένουν όπως ήταν: σύνδεσμος, χωρίς απαντήσεις μέσα στο Apex.
import { dec, enc } from "./crypto";
import { prisma } from "./db";

export const MAX_QUESTIONS = 30;
export const MAX_ANSWER = 5000;

/** Οι ερωτήσεις μιας φόρμας (κενός πίνακας = φόρμα με σύνδεσμο ή κείμενο). */
export function parseQuestions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_QUESTIONS) : [];
  } catch {
    return [];
  }
}

/** Από κείμενο «μία ερώτηση σε κάθε γραμμή» (φόρμα διαχείρισης) → JSON για τη βάση. */
export function questionsFromLines(text: string): string {
  const qs = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_QUESTIONS);
  return qs.length ? JSON.stringify(qs) : "";
}

export function isInAppForm(c: { kind: string; questions: string }): boolean {
  return c.kind === "FORM" && parseQuestions(c.questions).length > 0;
}

function parseAnswers(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
  } catch {
    return [];
  }
}

export type LatestAnswer = { contentId: string; answers: string[]; at: Date; versions: number };

/** Οι πιο πρόσφατες απαντήσεις ενός μέλους, για πολλές φόρμες μαζί (μία ερώτηση στη βάση). */
export async function latestAnswers(memberId: string, contentIds?: string[]): Promise<Map<string, LatestAnswer>> {
  const rows = await prisma.formAnswer.findMany({
    where: { memberId, ...(contentIds ? { contentId: { in: contentIds } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { contentId: true, answers: true, createdAt: true },
  });
  const out = new Map<string, LatestAnswer>();
  for (const r of rows) {
    const cur = out.get(r.contentId);
    if (cur) cur.versions++;
    else out.set(r.contentId, { contentId: r.contentId, answers: parseAnswers(dec(r.answers)), at: r.createdAt, versions: 1 });
  }
  return out;
}

/** Αποθήκευση απαντήσεων: νέα έκδοση μόνο αν άλλαξε κάτι. Επιστρέφει true αν γράφτηκε. */
export async function saveAnswers(memberId: string, contentId: string, answers: string[]): Promise<boolean> {
  const clean = answers.map((a) => a.slice(0, MAX_ANSWER).trim());
  const prev = (await latestAnswers(memberId, [contentId])).get(contentId);
  if (prev && JSON.stringify(prev.answers) === JSON.stringify(clean)) return false;
  if (!prev && clean.every((a) => !a)) return false;
  await prisma.formAnswer.create({ data: { memberId, contentId, answers: enc(JSON.stringify(clean)) } });
  return true;
}
