// Κανόνες του προγράμματος — καθαρές συναρτήσεις, ώστε να ελέγχονται με tests.
import type { Settings } from "./settings";
import { addDays, athensToUtc, daysBetween, isAfterLocal, localParts, mondayOf } from "./time";

/** «Μέρα Χ του προγράμματος» (η πρώτη μέρα είναι η 1). */
export function programDay(startDate: string | null | undefined, today: string): number | null {
  if (!startDate) return null;
  const d = daysBetween(startDate, today);
  return d < 0 ? null : d + 1;
}

/** Έχει φτάσει η ώρα (ώρα Ελλάδας) της σημερινής μέρας; */
export function isAfter(now: Date, hhmm: string): boolean {
  return isAfterLocal(localParts(now), hhmm);
}

export type BookingWindow = { open: boolean; weekStart: string; weekEnd: string; closesAt: Date };

/**
 * Οι κρατήσεις της εβδομάδας γίνονται τη μέρα κράτησης (Δευτέρα) και κλείνουν
 * μόνες τους στην ώρα κλεισίματος (21:00). Αφορούν την τρέχουσα εβδομάδα.
 */
export function bookingWindow(now: Date, s: Settings): BookingWindow {
  const p = localParts(now);
  const weekStart = mondayOf(p.date);
  const weekEnd = addDays(weekStart, 6);
  const offset = (s.bookingDay + 6) % 7; // Δευτέρα = 0
  const bookingDate = addDays(weekStart, offset);
  const [oh, om] = s.bookingOpenTime.split(":").map(Number);
  const [ch, cm] = s.bookingCloseTime.split(":").map(Number);
  const opensAt = athensToUtc(bookingDate, oh, om);
  const closesAt = athensToUtc(bookingDate, ch, cm);
  return { open: now >= opensAt && now < closesAt, weekStart, weekEnd, closesAt };
}

export type SlotLike = { id: string; startsAt: Date; therapistId: string | null; booked: boolean };

/** Ποιες θέσεις βλέπει το μέλος: με θεραπευτή, ελεύθερες, στο μέλλον. */
export function availableSlots<T extends SlotLike>(slots: T[], now: Date): T[] {
  return slots.filter((x) => x.therapistId && !x.booked && x.startsAt > now);
}

export type BookCheck = { ok: true } | { ok: false; reason: string };

export function canBook(args: {
  now: Date;
  settings: Settings;
  slot: SlotLike & { date: string };
  memberBookingsThisWeek: { date: string }[];
}): BookCheck {
  const { now, settings, slot, memberBookingsThisWeek } = args;
  const w = bookingWindow(now, settings);
  if (!w.open) return { ok: false, reason: "Οι κρατήσεις είναι κλειστές αυτή την ώρα." };
  if (slot.date < w.weekStart || slot.date > w.weekEnd)
    return { ok: false, reason: "Η ώρα δεν είναι σε αυτή την εβδομάδα." };
  if (!slot.therapistId || slot.booked || slot.startsAt <= now)
    return { ok: false, reason: "Η θέση δεν είναι πια ελεύθερη." };
  if (memberBookingsThisWeek.length >= settings.sessionsPerWeek)
    return { ok: false, reason: `Έχεις ήδη κλείσει ${settings.sessionsPerWeek} ραντεβού αυτή την εβδομάδα.` };
  if (memberBookingsThisWeek.some((b) => b.date === slot.date))
    return { ok: false, reason: "Έχεις ήδη ραντεβού αυτή τη μέρα." };
  return { ok: true };
}

/** Είναι ανοιχτό το κουμπί «Μπες στη συνεδρία σου»; */
export function sessionJoinable(startsAt: Date, now: Date, s: Settings): boolean {
  const from = startsAt.getTime() - s.sessionJoinBeforeMinutes * 60_000;
  const to = startsAt.getTime() + s.sessionMinutes * 60_000;
  return now.getTime() >= from && now.getTime() <= to;
}

/** Είναι ανοιχτό το κουμπί «Μπες στην ομάδα»; */
export function groupJoinable(now: Date, s: Settings): boolean {
  const p = localParts(now);
  if (!s.groupDays.includes(p.weekday)) return false;
  const [h, m] = s.groupTime.split(":").map(Number);
  const start = athensToUtc(p.date, h, m).getTime();
  const t = now.getTime();
  return t >= start - s.groupJoinBeforeMinutes * 60_000 && t <= start + s.groupDurationMinutes * 60_000;
}

/** Χρειάζεται νέα ειδοποίηση για κόκκινο κουμπί που δεν το ανέλαβε κανείς; */
export function helpNeedsEscalation(
  req: { claimedAt: Date | null; resolvedAt: Date | null; lastNotifiedAt: Date },
  now: Date,
  s: Settings,
): boolean {
  if (req.claimedAt || req.resolvedAt) return false;
  return now.getTime() - req.lastNotifiedAt.getTime() >= s.helpEscalateMinutes * 60_000;
}
