"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { generateCode, hashPassword, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logAccess } from "@/lib/audit";
import { headers } from "next/headers";
import { appUrl, mailConfigured, sendMail } from "@/lib/mail";
import { welcomeEmail } from "@/lib/welcome-email";

// Κωδικός μέλους για τα Google Forms (ψευδώνυμο, όχι όνομα): A-XXXXX χωρίς μπερδέματα.
function memberCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "A-" + Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

// email: τι έγινε με το email καλωσορίσματος (16/10) — στάλθηκε, δεν υπάρχει ρύθμιση (δείχνουμε το κείμενο), απέτυχε, ή δεν δόθηκε email.
export type CodeState = { code?: string; username?: string; error?: string; email?: { to: string; status: "sent" | "preview" | "failed"; subject: string; text: string; detail?: string } } | null;

// Στέλνει το καλωσόρισμα (ή τον νέο κωδικό) στο email του μέλους· χωρίς ρύθμιση Gmail επιστρέφει το κείμενο για να σταλεί με το χέρι.
async function emailCode(member: { name: string; username: string; email: string | null; role: string }, code: string, kind: "welcome" | "reset"): Promise<NonNullable<CodeState>["email"] | undefined> {
  if (!member.email || member.role !== "MEMBER") return undefined;
  const s = await getSettings();
  const host = (await headers()).get("host");
  const url = appUrl(host) + "/login";
  const contact = process.env.GMAIL_USER || "την ομάδα";
  const m = kind === "welcome"
    ? welcomeEmail({ name: member.name, username: member.username, code, url, groups: s.groups, contactEmail: contact, appName: s.appName })
    : { subject: `${s.appName} — νέος προσωπικός κωδικός`, text: `Γεια σου, ${member.name.split(" ")[0]}.\n\nΗ ομάδα σού έδωσε νέο κωδικό για το ${s.appName}.\nΔιεύθυνση: ${url}\nΌνομα χρήστη: ${member.username}\nΝέος κωδικός: ${code}\n\nΣτην πρώτη είσοδο θα σου ζητηθεί να βάλεις δικό σου κωδικό. Μην τον δώσεις σε κανέναν.\nΑν δεν ζήτησες εσύ νέο κωδικό, πες το μας αμέσως στο ${contact}.\n\nΗ ομάδα του ${s.appName}` };
  const r = await sendMail(member.email, m.subject, m.text);
  return { to: member.email, status: r.sent ? "sent" : r.reason === "not_configured" ? "preview" : "failed", subject: m.subject, text: m.text, detail: r.sent ? undefined : r.reason === "failed" ? r.detail : undefined };
}

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
  email: z.string().trim().toLowerCase().email("Το email δεν είναι σωστό").or(z.literal("")).optional().transform((v) => v || null),
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
        email: d.email,
        // Ο κωδικός φεύγει με email (απόφαση 16/10) → αλλάζει υποχρεωτικά στην πρώτη είσοδο.
        mustChangeCode: d.role === "MEMBER" && Boolean(d.email),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Το όνομα χρήστη ή το Telegram ID υπάρχει ήδη." };
    }
    throw e;
  }
  revalidatePath("/admin/people");
  const email = await emailCode({ name: d.name, username: d.username, email: d.email, role: d.role }, code, "welcome");
  return { code, username: d.username, email };
}

export async function resetCode(_: CodeState, formData: FormData): Promise<CodeState> {
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const code = generateCode();
  const before = await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true, email: true } });
  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(code), failedLogins: 0, lockedUntil: null, mustChangeCode: before.role === "MEMBER" && Boolean(before.email) },
  });
  await prisma.session.deleteMany({ where: { userId: id } });
  await logAccess(admin.id, id, "code_reset");
  const email = await emailCode({ name: user.name, username: user.username, email: user.email, role: user.role }, code, "reset");
  return { code, username: user.username, email };
}

// Χάθηκε/άλλαξε το κινητό: η διαχείριση σβήνει την επαλήθευση από το κινητό·
// με την επόμενη είσοδο ο άνθρωπος τη στήνει ξανά στο νέο του κινητό.
export async function reset2fa(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, failedLogins: 0, lockedUntil: null } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await logAccess(admin.id, id, "twofa_reset");
  redirect(`/admin/people/${id}?ok=1`);
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2),
  source: z.enum(["APEX", "AUTOGNOSIA_PLUS"]).optional(),
  programStartDate: optionalDate.optional(),
  telegramUserId: z.string().trim().optional().transform((v) => v || null),
  active: z.literal("on").optional(),
  therapistKind: z.enum(["BIOMATIC", "CLINICAL", "BOTH"]).or(z.literal("")).optional(),
  // Απλή αρχική (20/10): το πλαίσιο υπάρχει μόνο στη φόρμα προσωπικού (simpleHomeShown)· αλλιώς δεν αγγίζεται.
  simpleHome: z.literal("on").optional(),
  simpleHomeShown: z.literal("1").optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email("Το email δεν είναι σωστό").or(z.literal("")).optional().transform((v) => v || null),
});

export async function updatePerson(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const d = updateSchema.parse(Object.fromEntries(formData));
  const active = d.id === admin.id ? true : d.active === "on";
  // Απλή αρχική (20/10): επειδή αφαιρεί την πύλη «Εκκρεμεί σημείωμα», κάθε αλλαγή της γράφεται στο αρχείο πρόσβασης.
  const before = d.simpleHomeShown ? await prisma.user.findUnique({ where: { id: d.id }, select: { simpleHome: true } }) : null;
  const user = await prisma.user.update({
    where: { id: d.id },
    data: {
      name: d.name,
      active,
      ...(d.source ? { source: d.source } : {}),
      ...(d.programStartDate !== undefined ? { programStartDate: d.programStartDate } : {}),
      ...(formData.has("telegramUserId") ? { telegramUserId: d.telegramUserId } : {}),
      ...(d.therapistKind !== undefined ? { therapistKind: d.therapistKind || null } : {}),
      ...(d.simpleHomeShown ? { simpleHome: d.simpleHome === "on" } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(formData.has("email") ? { email: d.email } : {}),
    },
  });
  if (!active) await prisma.session.deleteMany({ where: { userId: user.id } });
  if (before && before.simpleHome !== user.simpleHome) await logAccess(admin.id, user.id, user.simpleHome ? "simple_home_on" : "simple_home_off");
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
