import "server-only";
import { prisma } from "./db";

export const STEPS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Σε ποιο βήμα λέει τώρα το μέλος ότι βρίσκεται (η τελευταία του δήλωση). */
export async function currentStep(memberId: string) {
  return prisma.memberStep.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { step: true, createdAt: true } });
}

/** Η τελευταία εργασία-βήμα που του έστειλε η διαχείριση, με το πού βρίσκεται. */
export async function lastStepWork(memberId: string) {
  const a = await prisma.assignment.findFirst({
    where: { memberId, step: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, step: true, title: true, createdAt: true, answeredAt: true },
  });
  if (!a) return null;
  return { id: a.id, step: a.step!, title: a.title, createdAt: a.createdAt, status: a.answeredAt ? "Το έγραψε" : "Δεν το έγραψε ακόμα" };
}
