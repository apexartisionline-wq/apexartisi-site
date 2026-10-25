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
/** Τι δείχνει το μενού του μέλους (layout /m και «Λογαριασμός» — μία πηγή, 20/10): πλάνο, μηνύματα, εκκρεμής έναρξη. */
export async function memberNavOpts(user: Pick<User, "id" | "source" | "alumniSince">): Promise<{ hasPlan: boolean; hasMessages: boolean; intakePending: boolean; alumnus: boolean }> {
  const [plan, monthly, closure, team, s, intake] = await Promise.all([
    prisma.safetyPlan.findUnique({ where: { memberId: user.id }, select: { memberId: true } }),
    prisma.monthlyMessage.findFirst({ where: { memberId: user.id, sentAt: { not: null } }, select: { id: true } }),
    prisma.closure.findFirst({ where: { memberId: user.id, sentAt: { not: null } }, select: { id: true } }),
    prisma.teamMessage.findFirst({ where: { memberId: user.id }, select: { id: true } }),
    getSettings(),
    memberIntake(user),
  ]);
  return { hasPlan: Boolean(plan), hasMessages: Boolean(monthly || closure || team), intakePending: s.requireIntake && !intake.status.complete, alumnus: Boolean(user.alumniSince) };
}

/** Σελίδες μόνο για μέλη του προγράμματος (ημερολόγιο ανάκαμψης, εργασίες): οι απόφοιτοι (25/10) γυρίζουν στο «Σήμερα». */
export async function requireProgramMember(): Promise<User> {
  const user = await requireMember();
  if (user.alumniSince) redirect("/m");
  return user;
}

export async function requireMember(): Promise<User> {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  if (s.requireIntake && !(await memberIntake(user)).status.complete) redirect("/m/start");
  return user;
}
