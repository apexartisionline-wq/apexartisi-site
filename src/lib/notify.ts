import "server-only";
import type { Role } from "@prisma/client";

export type PushMessage = { title: string; body?: string; url: string; tag?: string };

/**
 * Ειδοποίηση σε όλους τους χρήστες ενός ρόλου. Οι ειδοποιήσεις push (web push) μπαίνουν
 * σε επόμενο βήμα· μέχρι τότε η κλήση απλώς καταγράφεται.
 */
export async function notifyRole(role: Role, msg: PushMessage): Promise<void> {
  console.info(`[notify] ${role}: ${msg.title}`);
}
