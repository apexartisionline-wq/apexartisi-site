import "server-only";
import { prisma } from "./db";
import { extraGroupTimes } from "./groups";
import { groupsOn } from "./program";
import type { Settings } from "./settings";
import { athensToUtc, formatTime, localParts } from "./time";
import type { LiveEvent } from "@/components/LiveAlert";

/**
 * Οι αναδυόμενες ειδοποιήσεις της ημέρας για ένα μέλος (25/10): «άνοιξε» από τη στιγμή που ανοίγει το κουμπί ως την ώρα
 * έναρξης, και «ξεκίνησε · μπες τώρα» τα πρώτα 15′ — μόνο όσο δεν έχει μπει. Ίδιοι κανόνες με το «Μπες» της σελίδας.
 */
export async function liveEventsFor(memberId: string, s: Settings, now = new Date()): Promise<LiveEvent[]> {
  const date = localParts(now).date;
  const [extra, attended, bookings] = await Promise.all([
    extraGroupTimes(date, s),
    prisma.attendance.findUnique({ where: { memberId_date: { memberId, date } }, select: { id: true } }),
    prisma.booking.findMany({ where: { memberId, joinedAt: null, slot: { date } }, select: { id: true, slot: { select: { startsAt: true, kind: true } } } }),
  ]);
  const iso = (ms: number) => new Date(ms).toISOString();
  const out: LiveEvent[] = [];
  if (!attended) {
    const times = [...groupsOn(date, s).map((g) => g.time), ...extra].sort();
    for (const time of times) {
      const start = athensToUtc(date, ...(time.split(":").map(Number) as [number, number])).getTime();
      out.push({ key: `g-open:${date}:${time}`, from: iso(start - s.groupJoinBeforeMinutes * 60_000), to: iso(start), title: `Η ομάδα σου άνοιξε · ξεκινάμε στις ${time}`, button: "Μπες", action: "/m/join/group" });
      out.push({ key: `g-start:${date}:${time}`, from: iso(start), to: iso(start + 15 * 60_000), title: "Η ομάδα ξεκίνησε · μπες τώρα", button: "Μπες", action: "/m/join/group" });
    }
  }
  for (const b of bookings) {
    const start = b.slot.startsAt.getTime(), what = b.slot.kind === "PAIR" ? "Το Therapair σου" : "Η ατομική σου";
    out.push({ key: `b-open:${b.id}`, from: iso(start - s.sessionJoinBeforeMinutes * 60_000), to: iso(start), title: `${what} άνοιξε · ξεκινάμε στις ${formatTime(b.slot.startsAt)}`, button: "Μπες", action: `/m/join/${b.id}` });
    out.push({ key: `b-start:${b.id}`, from: iso(start), to: iso(start + 15 * 60_000), title: `${what} ξεκίνησε · μπες τώρα`, button: "Μπες", action: `/m/join/${b.id}` });
  }
  return out;
}
