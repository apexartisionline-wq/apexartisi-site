import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { appUrl, sendMail } from "./mail";
import { notifyMembers } from "./notify";
import { getSettings } from "./settings";
import { teamMessageEmail } from "./team-message-email";

export const TEAM_MESSAGE_MAX = 4000;

/**
 * Μήνυμα της ομάδας προς ένα ή πολλά μέλη (υπεύθυνη 22/10): μία κρυπτογραφημένη γραμμή ανά μέλος (κανείς δεν βλέπει σε ποιους
 * άλλους πήγε), ειδοποίηση με ουδέτερο τίτλο και ουδέτερο email χωρίς το κείμενο. Μόνο προς το μέλος — δεν απαντά (το κόκκινο
 * κουμπί μένει για ό,τι επείγει). `text` μπορεί να είναι συνάρτηση, για προσωπικό κείμενο ανά μέλος (π.χ. με το όνομα).
 */
export async function sendTeamMessage(
  memberIds: string[],
  text: string | ((m: { id: string; name: string }) => string),
  o: { sentById: string; kind?: "admin" | "cycle_done"; host?: string | null },
): Promise<{ sent: number; emailed: number; emailFailed: number; mailOff: boolean }> {
  const members = await prisma.user.findMany({ where: { id: { in: memberIds }, role: "MEMBER", active: true }, select: { id: true, name: true, email: true } });
  if (members.length === 0) return { sent: 0, emailed: 0, emailFailed: 0, mailOff: false };
  const rows = await prisma.$transaction(
    members.map((m) => prisma.teamMessage.create({ data: { memberId: m.id, kind: o.kind ?? "admin", text: enc((typeof text === "function" ? text(m) : text).slice(0, TEAM_MESSAGE_MAX)), sentById: o.sentById }, select: { id: true, memberId: true } })),
  );
  // Ουδέτερος τίτλος στην οθόνη κλειδώματος, όπως οι ανακοινώσεις· το κείμενο μόνο μέσα στο Apex.
  await notifyMembers(members.map((m) => m.id), { title: "Ένα μήνυμα από την ομάδα σου", url: "/m/message", tag: "team-message" }).catch((e) => console.error("[team-message push]", e));
  const s = await getSettings();
  const url = `${appUrl(o.host)}/m/message`;
  let emailed = 0, emailFailed = 0, mailOff = false;
  for (const m of members) {
    if (!m.email) continue;
    const mail = teamMessageEmail({ name: m.name, url, appName: s.appName });
    const r = await sendMail(m.email, mail.subject, mail.text);
    if (r.sent) {
      emailed++;
      const row = rows.find((x) => x.memberId === m.id);
      if (row) await prisma.teamMessage.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
    } else if (r.reason === "not_configured") mailOff = true;
    else emailFailed++;
  }
  return { sent: rows.length, emailed, emailFailed, mailOff };
}

/** Τα μηνύματα της ομάδας ενός μέλους, αποκρυπτογραφημένα, νεότερα πρώτα. */
export async function teamMessagesFor(memberId: string, take = 30) {
  const rows = await prisma.teamMessage.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({ ...r, text: dec(r.text) }));
}
