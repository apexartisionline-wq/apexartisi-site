import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { groupsOn } from "./program";
import type { PushMessage } from "./notify";
import { sendPush } from "./push";
import { getSettings } from "./settings";
import { addDays, athensToUtc, localParts, mondayOf, toMinutes } from "./time";

// Κατηγορίες ειδοποιήσεων μέλους (το μέλος κλείνει όποια θέλει). Ουδέτερα κείμενα.
export const MEMBER_PREFS = [
  { key: "daily", label: "Κείμενο της ημέρας" },
  { key: "reminders", label: "15′ πριν από ομάδα ή ατομική" },
  { key: "journal", label: "Ημερολόγιο (το βράδυ)" },
  { key: "booking", label: "Κρατήσεις της εβδομάδας" },
] as const;

export type Prefs = Partial<Record<(typeof MEMBER_PREFS)[number]["key"], boolean>>;
const on = (p: Prefs, k: keyof Prefs) => p[k] !== false;

/** Στέλνει μία φορά ανά κλειδί (π.χ. daily:2026-09-28:userId). */
async function once(key: string, userId: string, msg: PushMessage): Promise<void> {
  try {
    await prisma.notificationLog.create({ data: { key } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(subs.map((s) => sendPush(s, msg)));
}

/**
 * Καλείται κάθε λεπτό (cron). Τίποτα μετά τις 22:00 και πριν τις 08:00 — εκτός από το
 * κόκκινο κουμπί, που δεν περνά από εδώ.
 */
export async function runSchedule(now = new Date()): Promise<void> {
  const s = await getSettings();
  const p = localParts(now);
  const min = p.hour * 60 + p.minute;
  if (min >= 22 * 60 || min < 8 * 60) return;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, notifyPrefs: true, journal: { where: { date: p.date }, select: { id: true } } } });
  const at = (hhmm: string) => min >= toMinutes(hhmm) && min < toMinutes(hhmm) + 15;

  // Κείμενο της ημέρας
  if (at(s.dailyTextTime) && (await prisma.content.count({ where: { date: p.date, kind: "DAILY_TEXT" } })) > 0) {
    for (const m of members) if (on(m.notifyPrefs as Prefs, "daily")) await once(`daily:${p.date}:${m.id}`, m.id, { title: "Το κείμενό σου είναι έτοιμο", url: "/m" });
  }
  // Ημερολόγιο
  if (at(s.journalTime)) {
    for (const m of members) if (on(m.notifyPrefs as Prefs, "journal") && m.journal.length === 0) await once(`journal:${p.date}:${m.id}`, m.id, { title: "Ένα λεπτό για σένα", url: "/m" });
  }
  // Κράτηση: Δευτέρα 10:00 σε όλους, 19:00 σε όσους δεν έκλεισαν
  if (p.weekday === s.bookingDay && (at("10:00") || at("19:00"))) {
    const wk = mondayOf(p.date);
    const booked = new Set((await prisma.booking.findMany({ where: { slot: { date: { gte: wk, lte: addDays(wk, 6) } } }, select: { memberId: true } })).map((b) => b.memberId));
    const tag = at("10:00") ? "am" : "pm";
    for (const m of members) {
      if (!on(m.notifyPrefs as Prefs, "booking")) continue;
      if (tag === "pm" && booked.has(m.id)) continue;
      await once(`booking:${p.date}:${tag}:${m.id}`, m.id, { title: tag === "am" ? "Οι ώρες της εβδομάδας άνοιξαν" : `Οι κρατήσεις κλείνουν στις ${s.bookingCloseTime}`, url: "/m/book" });
    }
  }
  // 15′ πριν από ομάδα
  for (const g of groupsOn(p.date, s)) {
    const [h, mm] = g.time.split(":").map(Number);
    const start = athensToUtc(p.date, h, mm).getTime();
    const diff = (start - now.getTime()) / 60_000;
    if (diff > 0 && diff <= 15) {
      for (const m of members) if (on(m.notifyPrefs as Prefs, "reminders")) await once(`group:${p.date}:${g.time}:${m.id}`, m.id, { title: "Ξεκινάμε σε 15 λεπτά", url: "/m" });
    }
  }
  // 15′ πριν από ατομική/Therapair
  const soon = await prisma.booking.findMany({
    where: { slot: { startsAt: { gt: now, lte: new Date(now.getTime() + 15 * 60_000) } } },
    include: { member: { select: { notifyPrefs: true } } },
  });
  for (const b of soon) if (on(b.member.notifyPrefs as Prefs, "reminders")) await once(`session:${b.id}`, b.memberId, { title: "Ξεκινάμε σε 15 λεπτά", url: "/m" });
}
