import "server-only";
import { enc } from "./crypto";
import { prisma } from "./db";
import { notifyRole, notifyUsers } from "./notify";
import { helpState, shortName } from "./program";
import { getSettings } from "./settings";
import { hasConsent } from "./intake";
import { markClaimed, sendHelpAlert, telegramConfigured } from "./telegram";
import { addDays, localParts } from "./time";

/** Ποιος εφημερεύει τώρα (η «νύχτα» ξεκινά στις 18:00 και τελειώνει στις 09:00). */
export async function onCallNow(now = new Date()): Promise<string | null> {
  const p = localParts(now);
  const night = p.hour < 9 ? addDays(p.date, -1) : p.date;
  const row = await prisma.onCall.findUnique({ where: { date: night } });
  return row?.userId ?? null;
}

async function staffIds(): Promise<string[]> {
  const staff = await prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true } });
  return staff.map((s) => s.id);
}

/**
 * Στέλνει (ή ξαναστέλνει) την ειδοποίηση: Telegram στην ομάδα των θεραπευτών και push σε
 * όλο το προσωπικό. Στις επαναλήψεις ειδοποιούνται ρητά ο εφημερεύων και η Εύα.
 * Αν αποτύχει το Telegram, σημειώνεται, ώστε το μέλος να βλέπει αμέσως τις γραμμές βοήθειας.
 */
export async function sendAlert(requestId: string): Promise<void> {
  const req = await prisma.helpRequest.findUnique({ where: { id: requestId }, include: { member: { select: { name: true } } } });
  if (!req) return;
  const who = req.isDrill ? "Δοκιμαστικό μέλος" : shortName(req.member.name);
  const repeat = req.notifyCount;
  // Χωρίς συγκατάθεση για Telegram (01β·4) η ειδοποίηση πηγαίνει μόνο μέσα από το app·
  // μετράει όπως μια αποτυχία Telegram, ώστε το μέλος να βλέπει αμέσως τις γραμμές βοήθειας.
  const telegramOk = req.isDrill || (await hasConsent(req.memberId, "telegram"));
  let failed = !telegramConfigured() || !telegramOk;
  let ids = (req.telegramMessageIds as number[]) ?? [];
  if (!failed) {
    try {
      const id = await sendHelpAlert({ requestId, who, repeat, claimedBy: req.claimedAt ? req.claimedByName : null, drill: req.isDrill });
      ids = [...ids, id];
    } catch (e) {
      console.error("[help] Telegram", e);
      failed = true;
    }
  }
  // Push: ουδέτερο κείμενο στην οθόνη κλειδώματος· το όνομα φαίνεται μόνο μέσα στο app.
  const title = req.isDrill ? "Δοκιμή κόκκινου κουμπιού" : repeat > 0 ? "Κόκκινο κουμπί — χρειάζεται απάντηση" : "Κόκκινο κουμπί";
  const url = `/t/help/${requestId}`;
  if (repeat === 0) {
    await notifyUsers(await staffIds(), { title, url, tag: `help-${requestId}`, urgent: true });
  } else {
    const onCall = await onCallNow();
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    await notifyUsers([...new Set([...(onCall ? [onCall] : []), ...admins.map((a) => a.id)])], { title, url, tag: `help-${requestId}`, urgent: true });
  }
  await prisma.helpRequest.update({
    where: { id: requestId },
    data: {
      telegramMessageIds: ids,
      notifyCount: { increment: 1 },
      lastNotifiedAt: new Date(),
      ...(failed && !req.deliveryFailedAt ? { deliveryFailedAt: new Date() } : {}),
    },
  });
}

/** Νέο πάτημα «Θέλω άνθρωπο». Κάθε νέο πάτημα στέλνει ειδοποίηση (εκτός από διπλό κλικ). */
export async function requestHuman(memberId: string, drill = false): Promise<string> {
  const recent = await prisma.helpRequest.findFirst({
    where: { memberId, isDrill: drill, resolvedAt: null, talkedAt: null, createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return recent.id;
  const req = await prisma.helpRequest.create({ data: { memberId, isDrill: drill, lastNotifiedAt: new Date(0) } });
  await sendAlert(req.id);
  return req.id;
}

/** Ανάληψη (από Telegram ή μέσα από το app). Μόνο ο πρώτος παίρνει το αίτημα. */
export async function claim(requestId: string, userId: string): Promise<{ ok: boolean; claimedBy: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === "MEMBER") return { ok: false, claimedBy: null };
  const done = await prisma.helpRequest.updateMany({
    where: { id: requestId, claimedAt: null },
    data: { claimedAt: new Date(), claimedById: user.id, claimedByName: user.name },
  });
  const req = await prisma.helpRequest.findUnique({ where: { id: requestId }, include: { member: { select: { id: true, name: true } } } });
  if (!req) return { ok: false, claimedBy: null };
  if (done.count === 1) {
    await markClaimed(req.telegramMessageIds as number[], req.isDrill ? "Δοκιμή" : shortName(req.member.name), user.name).catch(() => undefined);
    if (!req.isDrill) await notifyUsers([req.member.id], { title: "Κάποιος από την ομάδα σε παίρνει τώρα", url: "/m/help", tag: "help-claimed" });
  }
  return { ok: done.count === 1, claimedBy: req.claimedByName };
}

/** «Μιλήσαμε» + σύντομη έκβαση· δημιουργεί τα μηνύματα φροντίδας 24 ωρών και 7 ημερών. */
export async function markTalked(requestId: string, userId: string, outcome: string): Promise<void> {
  const req = await prisma.helpRequest.findUnique({ where: { id: requestId } });
  if (!req || req.talkedAt) return;
  await prisma.helpRequest.update({ where: { id: requestId }, data: { talkedAt: new Date(), outcome: enc(outcome.slice(0, 2000)), resolvedAt: new Date(), ...(req.claimedAt ? {} : { claimedAt: new Date(), claimedById: userId }) } });
  if (!req.isDrill) {
    const now = Date.now();
    await prisma.careTask.createMany({
      data: [
        { memberId: req.memberId, kind: "caring_24h", dueAt: new Date(now + 24 * 3_600_000) },
        { memberId: req.memberId, kind: "caring_7d", dueAt: new Date(now + 7 * 24 * 3_600_000) },
      ],
    });
  }
}

/** Ξαναστέλνει ό,τι χρειάζεται (cron κάθε λεπτό· και η σελίδα του μέλους όσο είναι ανοιχτή). */
export async function escalatePending(onlyId?: string): Promise<number> {
  const s = await getSettings();
  const now = new Date();
  const open = await prisma.helpRequest.findMany({
    where: { resolvedAt: null, talkedAt: null, ...(onlyId ? { id: onlyId } : { createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } }) },
  });
  let sent = 0;
  for (const req of open) {
    if (!helpState(req, now, s).resend) continue;
    // Προστασία από διπλή αποστολή όταν τρέχουν ταυτόχρονα cron και σελίδα μέλους.
    const locked = await prisma.helpRequest.updateMany({
      where: { id: req.id, lastNotifiedAt: req.lastNotifiedAt },
      data: { lastNotifiedAt: now },
    });
    if (locked.count === 0) continue;
    try {
      await sendAlert(req.id);
      sent++;
    } catch (e) {
      console.error("[help] escalation", req.id, e);
    }
  }
  return sent;
}

/** Υπενθυμίσεις για μηνύματα φροντίδας που έφτασαν (καλείται από το cron). */
export async function remindCareTasks(): Promise<void> {
  const due = await prisma.careTask.count({ where: { doneAt: null, dueAt: { lte: new Date() } } });
  if (due > 0) await notifyRole("THERAPIST", { title: "Μήνυμα φροντίδας προς μέλος", url: "/t", tag: "care" });
}
