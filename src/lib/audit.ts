import "server-only";
import { prisma } from "./db";

/** Καταγραφή πρόσβασης σε δεδομένα μέλους (ποιος, ποιον φάκελο, τι, πότε). */
export async function logAccess(userId: string, memberId: string | null, action: string): Promise<void> {
  await prisma.accessLog.create({ data: { userId, memberId, action } }).catch((e) => console.error("[audit]", e));
}
