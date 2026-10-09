import "server-only";
import { z } from "zod";
import { type Assessment, ALERTS, type AlertKind, assessmentAlerts, assessmentSchema, keepAdminOnly, soberSinceFrom } from "./assessment";
import { logAccess } from "./audit";
import { notifyRole } from "./notify";
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
  let fresh = 0;
  for (const kind of assessmentAlerts(d, today)) {
    const exists = await prisma.teamAlert.findFirst({ where: { memberId, source: "ASSESSMENT", kind } });
    if (!exists) {
      await prisma.teamAlert.create({ data: { memberId, source: "ASSESSMENT", kind, byId: user.id } });
      fresh++;
    }
  }
  // Νέο σοβαρό σημείο: ειδοποίηση στη διαχείριση (ουδέτερο κείμενο).
  if (fresh) await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${memberId}` }).catch(() => undefined);

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
const phone = z.string().trim().max(30).refine((v) => v === "" || /^\+?[0-9 ]{10,15}$/.test(v), "Γράψε το τηλέφωνο μόνο με αριθμούς (10 ψηφία).").default("");
export const profileSchema = z
  .object({
    fullName: text(120),
    preferredName: text(60),
    birthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).default(""),
    mobile: phone,
    email: z.union([z.string().trim().email("Το email δεν φαίνεται σωστό."), z.literal("")]).default(""),
    address: text(300),
    abroadCountry: text(80),
    ecName: text(120),
    ecRelation: text(60),
    ecPhone: phone,
    ecWhen: z.enum(["LIFE", "LIFE_OR_LOST"]).optional(),
    ecWhatToSay: text(300),
  })
  .superRefine((p, ctx) => {
    const need = (k: string, m: string) => ctx.addIssue({ code: "custom", path: [k], message: m });
    if (!p.fullName) need("fullName", "Ονοματεπώνυμο");
    if (!p.birthDate) need("birthDate", "Ημερομηνία γέννησης");
    else if (p.birthDate > new Date().toISOString().slice(0, 10) || p.birthDate < "1900-01-01") need("birthDate", "Η ημερομηνία γέννησης δεν φαίνεται σωστή.");
    if (!p.mobile) need("mobile", "Κινητό");
    if (!p.address) need("address", "Διεύθυνση");
    if (p.ecName && !p.ecPhone) need("ecPhone", "Τηλέφωνο του ανθρώπου για έκτακτη ανάγκη");
    if (p.ecPhone && !p.ecName) need("ecName", "Όνομα του ανθρώπου για έκτακτη ανάγκη");
  });
export type Profile = z.infer<typeof profileSchema>;
export const EC_WHEN = { LIFE: "Μόνο αν κινδυνεύει η ζωή μου", LIFE_OR_LOST: "Και αν χαθεί κάθε επαφή μαζί μου" } as const;
export const PROFILE_LABELS: Record<string, string> = {
  fullName: "Ονοματεπώνυμο", preferredName: "Πώς θέλει να τον/τη λέμε", birthDate: "Γέννηση", mobile: "Κινητό", email: "Email",
  address: "Διεύθυνση", abroadCountry: "Ζει εκτός Ελλάδας", ecName: "Επαφή έκτακτης ανάγκης", ecRelation: "Σχέση", ecPhone: "Τηλέφωνο επαφής",
  ecWhen: "Πότε καλούμε την επαφή", ecWhatToSay: "Τι λέμε στην επαφή",
};

/** Οι δύο τελευταίες μορφές των στοιχείων: για το «τι άλλαξε». */
export async function profileHistory(memberId: string) {
  const rows = await prisma.memberProfile.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 2 });
  const [cur, prev] = rows.map((r) => ({ data: readProfile(r.data), at: r.createdAt }));
  const changed = cur && prev ? (Object.keys(PROFILE_LABELS) as (keyof Profile)[]).filter((k) => (cur.data[k] ?? "") !== (prev.data[k] ?? "")).map((k) => PROFILE_LABELS[k]) : [];
  return { cur: cur ?? null, changed, count: await prisma.memberProfile.count({ where: { memberId } }) };
}

export async function latestProfile(memberId: string) {
  const row = await prisma.memberProfile.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" } });
  return row ? { data: readProfile(row.data), at: row.createdAt } : null;
}

/** Ανάγνωση αποθηκευμένων στοιχείων χωρίς τους κανόνες συμπλήρωσης (μπορεί να είναι παλιά/ελλιπή). */
function readProfile(raw: string): Profile {
  const o = JSON.parse(dec(raw)) as Partial<Profile>;
  return { fullName: "", preferredName: "", birthDate: "", mobile: "", email: "", address: "", abroadCountry: "", ecName: "", ecRelation: "", ecPhone: "", ecWhatToSay: "", ...o };
}

export async function saveProfile(memberId: string, byId: string, p: Profile) {
  await prisma.memberProfile.create({ data: { memberId, byId, data: enc(JSON.stringify(p)) } });
}

// ── Ειδοποιήσεις ομάδας ─────────────────────────────────────────────────────

export const ALERT_SOURCE: Record<string, string> = { ASSESSMENT: "Αρχική αξιολόγηση", RISK: "Ανάγκες ασφάλειας", EMERGENCY: "Έκτακτη ανάγκη", NOTE: "Σημείωμα ατομικής", JOURNAL: "Ημερολόγιο μέλους" };

export function alertText(source: string, kind: string): string {
  if (source === "ASSESSMENT") return ALERTS[kind as AlertKind] ?? kind;
  if (source === "RISK") return kind === "HIGH" ? "Υψηλές ανάγκες ασφάλειας · τον/την παίρνει η διαχείριση την επόμενη μέρα" : "Αυξημένες ανάγκες ασφάλειας · τον/την παίρνει η διαχείριση μέσα σε 24 ώρες";
  if (source === "EMERGENCY") return "Άνοιξαν τα στοιχεία έκτακτης ανάγκης";
  if (source === "JOURNAL") return "Έγραψε στο ημερολόγιο ότι είχε σκέψεις να κάνει κακό στον εαυτό του/της";
  if (source === "NOTE") return "Προβληματισμός προς τη θεραπευτική ομάδα — άνοιξε το σημείωμα";
  return kind;
}

/** Σοβαρά σημεία των τελευταίων 24 ωρών, για το «Σήμερα» όλης της ομάδας (χωρίς κουμπί). */
export async function recentAlerts(now = new Date()) {
  const rows = await prisma.teamAlert.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const ids = [...new Set(rows.flatMap((r) => [r.memberId, r.byId]))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...r,
    member: names.get(r.memberId) ?? "Μέλος",
    by: r.source === "JOURNAL" ? "από το μέλος" : (names.get(r.byId) ?? ""),
    text: alertText(r.source, r.kind),
    mild: isMild(r.source, r.kind),
    sourceLabel: r.source === "NOTE" && r.kind.startsWith("PAIR:") ? "Σημείωμα Therapair" : (ALERT_SOURCE[r.source] ?? ""),
  }));
}

/**
 * Τα σοβαρά σημεία των τελευταίων 24 ωρών, ένα κουτί ανά μέλος (το πιο πρόσφατο πρώτο).
 * Το «άνοιξαν τα στοιχεία έκτακτης ανάγκης» το βλέπει μόνο η διαχείριση.
 */
export async function alertBoxes(role: string, now = new Date()) {
  const shown = (await recentAlerts(now)).filter((a) => a.source !== "EMERGENCY" || role === "ADMIN");
  return [...new Set(shown.map((a) => a.memberId))].map((id) => ({ id, items: shown.filter((a) => a.memberId === id) }));
}
export type AlertBox = Awaited<ReturnType<typeof alertBoxes>>[number];

/** Η εγκυμοσύνη ειδοποιεί αμέσως, αλλά φαίνεται με κίτρινο (δεν είναι κίνδυνος όπως παιδί ή βία). */
export function isMild(source: string, kind: string): boolean {
  return (source === "ASSESSMENT" && kind === "PREGNANCY") || source === "NOTE";
}

/** Τα σοβαρά σημεία που ισχύουν τώρα (από την τελευταία μορφή της αξιολόγησης), με το πότε και από ποιον σημειώθηκαν. */
export async function assessmentFlags(memberId: string, now = new Date()) {
  // Ένα χαλασμένο αρχείο δεν πρέπει να ρίχνει το «Σήμερα» όλων: το καταγράφουμε και συνεχίζουμε.
  const latest = await latestAssessment(memberId).catch((e) => (console.error("[assessment]", memberId, e), null));
  if (!latest) return [];
  const kinds = assessmentAlerts(latest.data, localParts(now).date);
  if (kinds.length === 0) return [];
  const rows = await prisma.teamAlert.findMany({ where: { memberId, source: "ASSESSMENT", kind: { in: kinds } }, orderBy: { createdAt: "asc" } });
  const by = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.byId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return kinds.map((k) => {
    const r = rows.find((x) => x.kind === k);
    return { kind: k, text: `${ALERTS[k]} (αρχική αξιολόγηση${r ? ` · ${by.get(r.byId) ?? ""}` : ""})`, at: r?.createdAt ?? latest.at };
  });
}
