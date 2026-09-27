import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";
import { verifyTotp } from "./totp";

const COOKIE = "apex_session";
// Τα μέλη μένουν συνδεδεμένα στο κινητό (το κόκκινο κουμπί «δεν χρειάζεται κωδικό»)·
// το προσωπικό, που βλέπει φακέλους, αποσυνδέεται πιο γρήγορα.
const SESSION_HOURS: Record<Role, number> = { MEMBER: 180 * 24, THERAPIST: 12, ADMIN: 12 };
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Όριο προσπαθειών ανά διεύθυνση (στη μνήμη του server): 10 λάθη / 15 λεπτά.
const attempts = new Map<string, { n: number; until: number }>();
function ipLimited(ip: string): boolean {
  const a = attempts.get(ip);
  return Boolean(a && a.n >= 10 && a.until > Date.now());
}
function ipFailed(ip: string): void {
  const a = attempts.get(ip);
  const now = Date.now();
  if (!a || a.until < now) attempts.set(ip, { n: 1, until: now + LOCK_MINUTES * 60_000 });
  else a.n++;
}

// Για σταθερό χρόνο απάντησης όταν ο χρήστης δεν υπάρχει.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-code", 12);

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export const hashPassword = (code: string) => bcrypt.hash(code, 12);

/** Προσωπικός κωδικός: 10 χαρακτήρες χωρίς μπερδέματα (0/O, 1/l). */
export function generateCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function login(username: string, code: string, ip = "unknown", otp = ""): Promise<User | null | "otp"> {
  if (ipLimited(ip)) return null;
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.active) {
    await bcrypt.compare(code, DUMMY_HASH);
    ipFailed(ip);
    return null;
  }
  // Κλείδωμα λογαριασμού μόνο για το προσωπικό: ένα μέλος δεν πρέπει ποτέ να μπορεί να
  // κλειδωθεί έξω από το κόκκινο κουμπί από κάποιον που ξέρει το όνομα χρήστη του.
  const staff = user.role !== "MEMBER";
  if (staff && user.lockedUntil && user.lockedUntil > new Date()) return null;
  const ok = await bcrypt.compare(code, user.passwordHash);
  if (!ok) {
    ipFailed(ip);
    if (staff) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: failed >= MAX_FAILED
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failed },
      });
    }
    return null;
  }
  // Προσωπικό με δεύτερο παράγοντα: χρειάζεται και ο 6ψήφιος κωδικός.
  if (staff && user.totpEnabled && !verifyTotp(user.totpSecret, otp)) {
    if (otp) ipFailed(ip);
    return "otp";
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS[user.role] * 3_600_000);
  await prisma.session.create({ data: { id: hashToken(token), userId: user.id, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

/** Αποσύνδεση από όλες τις συσκευές. */
export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Για το προσωπικό: αν απαιτείται δεύτερος παράγοντας και δεν έχει ρυθμιστεί, πρώτα αυτό. */
export async function requireStaff2FA(user: User): Promise<void> {
  if (user.role === "MEMBER" || user.totpEnabled) return;
  const { getSettings } = await import("./settings");
  if ((await getSettings()).requireStaff2FA) redirect("/account?setup2fa=1");
}

/** Καθένας βλέπει μόνο όσα του αναλογούν. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function homeFor(role: Role): string {
  return role === "MEMBER" ? "/m" : role === "THERAPIST" ? "/t" : "/admin";
}
