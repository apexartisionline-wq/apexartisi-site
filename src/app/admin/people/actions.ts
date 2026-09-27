"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { generateCode, hashPassword, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

// Κωδικός μέλους για τα Google Forms (ψευδώνυμο, όχι όνομα): A-XXXXX χωρίς μπερδέματα.
function memberCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "A-" + Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

export type CodeState = { code?: string; username?: string; error?: string } | null;

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((v) => v || null);

const personSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Μόνο λατινικά, αριθμοί και . _ - (3–32)"),
  role: z.enum(["MEMBER", "THERAPIST", "ADMIN"]),
  source: z.enum(["APEX", "AUTOGNOSIA_PLUS"]).optional(),
  programStartDate: optionalDate.optional(),
  telegramUserId: z.string().trim().optional().transform((v) => v || null),
  therapistKind: z.enum(["BIOMATIC", "CLINICAL", "BOTH"]).or(z.literal("")).optional().transform((v) => v || null),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
});

export async function createPerson(_: CodeState, formData: FormData): Promise<CodeState> {
  await requireRole("ADMIN");
  const parsed = personSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };
  const d = parsed.data;
  const code = generateCode();
  try {
    await prisma.user.create({
      data: {
        name: d.name,
        username: d.username,
        role: d.role,
        passwordHash: await hashPassword(code),
        source: d.role === "MEMBER" ? (d.source ?? "APEX") : null,
        programStartDate: d.role === "MEMBER" ? (d.programStartDate ?? null) : null,
        telegramUserId: d.role !== "MEMBER" ? d.telegramUserId : null,
        therapistKind: d.role !== "MEMBER" ? d.therapistKind : null,
        memberCode: d.role === "MEMBER" ? memberCode() : null,
        phone: d.phone,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Το όνομα χρήστη ή το Telegram ID υπάρχει ήδη." };
    }
    throw e;
  }
  revalidatePath("/admin/people");
  return { code, username: d.username };
}

export async function resetCode(_: CodeState, formData: FormData): Promise<CodeState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const code = generateCode();
  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(code), failedLogins: 0, lockedUntil: null },
  });
  await prisma.session.deleteMany({ where: { userId: id } });
  return { code, username: user.username };
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2),
  source: z.enum(["APEX", "AUTOGNOSIA_PLUS"]).optional(),
  programStartDate: optionalDate.optional(),
  telegramUserId: z.string().trim().optional().transform((v) => v || null),
  active: z.literal("on").optional(),
  therapistKind: z.enum(["BIOMATIC", "CLINICAL", "BOTH"]).or(z.literal("")).optional(),
  phone: z.string().trim().max(30).optional(),
});

export async function updatePerson(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const d = updateSchema.parse(Object.fromEntries(formData));
  const active = d.id === admin.id ? true : d.active === "on";
  const user = await prisma.user.update({
    where: { id: d.id },
    data: {
      name: d.name,
      active,
      ...(d.source ? { source: d.source } : {}),
      ...(d.programStartDate !== undefined ? { programStartDate: d.programStartDate } : {}),
      ...(formData.has("telegramUserId") ? { telegramUserId: d.telegramUserId } : {}),
      ...(d.therapistKind !== undefined ? { therapistKind: d.therapistKind || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
    },
  });
  if (!active) await prisma.session.deleteMany({ where: { userId: user.id } });
  redirect(`/admin/people/${d.id}?ok=1`);
}

export async function newCycle(formData: FormData) {
  await requireRole("ADMIN");
  const s = await getSettings();
  const memberId = String(formData.get("id"));
  const length = Number(formData.get("length")) || s.cycleLength;
  await prisma.cycle.updateMany({ where: { memberId, closedAt: null }, data: { closedAt: new Date() } });
  // Νέος κύκλος από την Εύα = ήδη τακτοποιημένος.
  await prisma.cycle.create({ data: { memberId, length, settledAt: new Date() } });
  redirect(`/admin/people/${memberId}?ok=1`);
}
