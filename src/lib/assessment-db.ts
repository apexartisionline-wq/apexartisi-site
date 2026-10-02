import "server-only";
import { z } from "zod";
import { type Assessment, ALERTS, type AlertKind, assessmentAlerts, assessmentSchema, keepAdminOnly, soberSinceFrom } from "./assessment";
import { logAccess } from "./audit";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { localParts } from "./time";

export async function latestAssessment(memberId: string) {
  const row = await prisma.assessment.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  const author = await prisma.user.findUnique({ where: { id: row.authorId }, select: { name: true } });
  return { data: assessmentSchema.parse(JSON.parse(dec(row.data))), complete: row.complete, at: row.createdAt, author: author?.name ?? "" };
}

/** Μόνο ψυχολόγος (ή η διαχείριση) γράφει την αρχική αξιολόγηση. */
export function canWriteAssessment(user: { role: string; therapistKind: string | null }): boolean {
  return user.role === "ADMIN" || user.therapistKind === "CLINICAL" || user.therapistKind === "BOTH";
}

/**
 * Αποθήκευση ως νέα έκδοση. Βγάζει ειδοποιήσεις για σοβαρά σημεία (μία φορά ανά είδος)
 * και, μόλις ολοκληρωθεί, περνά την ημερομηνία νηφαλιότητας στον φάκελο και σημειώνει το βήμα 02.
 */
export async function saveAssessment(memberId: string, user: { id: string; role: string }, input: Assessment, complete: boolean) {
  const prev = await latestAssessment(memberId);
  // Όποιος δεν είναι διαχείριση δεν βλέπει τα πεδία της μετά την ολοκλήρωση: κρατιούνται από πριν.
  const d = user.role !== "ADMIN" && prev?.complete ? keepAdminOnly(input, prev.data) : input;
  const done = complete || Boolean(prev?.complete);
  await prisma.assessment.create({ data: { memberId, data: enc(JSON.stringify(d)), complete: done, authorId: user.id } });

  const today = localParts(new Date()).date;
  for (const kind of assessmentAlerts(d, today)) {
    const exists = await prisma.teamAlert.findFirst({ where: { memberId, source: "ASSESSMENT", kind } });
    if (!exists) await prisma.teamAlert.create({ data: { memberId, source: "ASSESSMENT", kind, byId: user.id } });
  }

  if (done) {
    const since = soberSinceFrom(d);
    const m = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true } });
    if (since && since !== m.soberSince) {
      await prisma.$transaction([
        prisma.sobrietyChange.create({ data: { memberId, previous: m.soberSince, date: since, byId: user.id, note: enc("Αρχική αξιολόγηση") } }),
        prisma.user.update({ where: { id: memberId }, data: { soberSince: since } }),
      ]);
    }
    await prisma.intakeCheck.upsert({
      where: { memberId_key: { memberId, key: "assessment" } },
      create: { memberId, key: "assessment", doneById: user.id },
      update: {},
    });
  }
  await logAccess(user.id, memberId, complete ? "assessment_complete" : "assessment_save");
}

// ── Στοιχεία του μέλους (μόνο διαχείριση) ─────────────────────────────────

const text = (max: number) => z.string().trim().max(max).default("");
export const profileSchema = z.object({
  fullName: text(120),
  preferredName: text(60),
  birthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).default(""),
  mobile: text(30),
  email: text(120),
  address: text(300),
  abroadCountry: text(80),
  ecName: text(120),
  ecRelation: text(60),
  ecPhone: text(30),
  ecWhen: z.enum(["LIFE", "LIFE_OR_LOST"]).optional(),
  ecWhatToSay: text(300),
});
export type Profile = z.infer<typeof profileSchema>;
export const EC_WHEN = { LIFE: "Μόνο αν κινδυνεύει η ζωή μου", LIFE_OR_LOST: "Και αν χαθεί κάθε επαφή μαζί μου" } as const;

export async function latestProfile(memberId: string) {
  const row = await prisma.memberProfile.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" } });
  return row ? { data: profileSchema.parse(JSON.parse(dec(row.data))), at: row.createdAt } : null;
}

export async function saveProfile(memberId: string, byId: string, p: Profile) {
  await prisma.memberProfile.create({ data: { memberId, byId, data: enc(JSON.stringify(p)) } });
}

// ── Ειδοποιήσεις ομάδας ─────────────────────────────────────────────────────

export function alertText(source: string, kind: string): string {
  return source === "ASSESSMENT" ? (ALERTS[kind as AlertKind] ?? kind) : kind;
}

export async function openAlerts() {
  const rows = await prisma.teamAlert.findMany({ where: { claimedAt: null }, orderBy: { createdAt: "asc" } });
  const ids = [...new Set(rows.flatMap((r) => [r.memberId, r.byId]))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, member: names.get(r.memberId) ?? "Μέλος", by: names.get(r.byId) ?? "", text: alertText(r.source, r.kind) }));
}
