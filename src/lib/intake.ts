import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { requireRole } from "./auth";
import { prisma } from "./db";
import { type Choice, intakeStatus, latestChoices } from "./intake-rules";
import { getSettings } from "./settings";

export async function memberConsents(memberId: string): Promise<Record<string, Choice>> {
  const rows = await prisma.consent.findMany({ where: { memberId }, select: { purpose: true, choice: true, recordedAt: true } });
  return latestChoices(rows);
}

export async function hasConsent(memberId: string, purpose: string): Promise<boolean> {
  const row = await prisma.consent.findFirst({ where: { memberId, purpose }, orderBy: { recordedAt: "desc" }, select: { choice: true } });
  return row?.choice === "YES";
}

export async function memberIntake(member: Pick<User, "id" | "source">) {
  const [checks, consents] = await Promise.all([
    prisma.intakeCheck.findMany({ where: { memberId: member.id } }),
    memberConsents(member.id),
  ]);
  return { checks, consents, status: intakeStatus({ source: member.source, done: checks.map((c) => c.key), consents }) };
}

/**
 * Μέλος με ολοκληρωμένη έναρξη συνεργασίας. Μέχρι τότε βλέπει μόνο τη σελίδα έναρξης,
 * το κόκκινο κουμπί, το πλάνο του και τον λογαριασμό του.
 */
export async function requireMember(): Promise<User> {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  if (s.requireIntake && !(await memberIntake(user)).status.complete) redirect("/m/start");
  return user;
}
