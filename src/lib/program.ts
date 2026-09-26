// Κανόνες του προγράμματος — καθαρές συναρτήσεις, ώστε να ελέγχονται με tests.
import type { Settings } from "./settings";
import { addDays, athensToUtc, daysBetween, isAfterLocal, localParts, mondayOf, weekdayOf } from "./time";

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

/** Διάρκεια θέσης: ατομική 40′, Therapair 55′. */
export function slotMinutes(kind: "INDIVIDUAL" | "PAIR", s: Settings): number {
  return kind === "PAIR" ? s.pairMinutes : s.sessionMinutes;
}

export const slotCapacity = (kind: "INDIVIDUAL" | "PAIR") => (kind === "PAIR" ? 2 : 1);

/** Είναι ανοιχτό το κουμπί «Μπες στη συνεδρία σου»; */
export function sessionJoinable(startsAt: Date, now: Date, s: Settings, minutes = s.sessionMinutes): boolean {
  const from = startsAt.getTime() - s.sessionJoinBeforeMinutes * 60_000;
  const to = startsAt.getTime() + minutes * 60_000;
  return now.getTime() >= from && now.getTime() <= to;
}

export type GroupEntry = Settings["groups"][number];

/** Οι ομάδες μιας ημερομηνίας, με σειρά ώρας. */
export function groupsOn(date: string, s: Settings): GroupEntry[] {
  const wd = weekdayOf(date);
  return s.groups.filter((g) => g.weekday === wd).sort((a, b) => a.time.localeCompare(b.time));
}

/** Ο συντονιστής από τη σταθερή εναλλαγή (π.χ. Παρασκευή: μία εβδομάδα ο ένας, την άλλη ο άλλος). */
export function rotationCoordinator(g: GroupEntry, date: string, s: Settings): string | null {
  if (g.rotation.length === 0) return null;
  const weeks = Math.floor(daysBetween(mondayOf(s.groupRotationAnchor), mondayOf(date)) / 7);
  const n = g.rotation.length;
  return g.rotation[((weeks % n) + n) % n] || null;
}

/** Η ομάδα της ημέρας που είναι «ανοιχτή» τώρα για είσοδο, αν υπάρχει. */
export function joinableGroup(now: Date, s: Settings): GroupEntry | null {
  const p = localParts(now);
  const t = now.getTime();
  for (const g of groupsOn(p.date, s)) {
    const [h, m] = g.time.split(":").map(Number);
    const start = athensToUtc(p.date, h, m).getTime();
    if (t >= start - s.groupJoinBeforeMinutes * 60_000 && t <= start + s.groupDurationMinutes * 60_000) return g;
  }
  return null;
}

export const groupJoinable = (now: Date, s: Settings) => joinableGroup(now, s) !== null;

/** Έχει ξεκινήσει η (πρώτη) ομάδα της ημέρας; */
export function groupStarted(date: string, now: Date, s: Settings): boolean {
  const first = groupsOn(date, s)[0];
  if (!first) return false;
  const [h, m] = first.time.split(":").map(Number);
  return now >= athensToUtc(date, h, m);
}

// ---- Εναλλαγή βιωματικού / κλινικού στις ατομικές ----

export type Kind = "BIOMATIC" | "CLINICAL" | "BOTH";

/** Ποιος τύπος είναι σειρά του μέλους, με βάση την προηγούμενη ατομική. */
export function neededKind(previous: Kind | null | undefined): "BIOMATIC" | "CLINICAL" | null {
  if (previous === "BIOMATIC") return "CLINICAL";
  if (previous === "CLINICAL") return "BIOMATIC";
  return null;
}

/**
 * Διαλέγει θέση σε μια ώρα ώστε να τηρείται η εναλλαγή. Πρώτα θεραπευτής του τύπου
 * που χρειάζεται, μετά κάποιος που κάνει και τα δύο, αλλιώς οποιαδήποτε θέση — τότε
 * το ραντεβού σημειώνεται για έλεγχο από την Εύα.
 */
export function pickSlot<T extends { therapistKind: Kind | null }>(
  free: T[],
  needed: "BIOMATIC" | "CLINICAL" | null,
): { slot: T; kind: "BIOMATIC" | "CLINICAL" | null; ok: boolean } | null {
  if (free.length === 0) return null;
  if (!needed) {
    const slot = free.find((x) => x.therapistKind && x.therapistKind !== "BOTH") ?? free[0];
    const k = slot.therapistKind;
    return { slot, kind: k === "BOTH" ? "BIOMATIC" : k, ok: true };
  }
  const exact = free.find((x) => x.therapistKind === needed);
  if (exact) return { slot: exact, kind: needed, ok: true };
  const both = free.find((x) => x.therapistKind === "BOTH");
  if (both) return { slot: both, kind: needed, ok: true };
  const other = free[0];
  const k = other.therapistKind;
  return { slot: other, kind: k === "BOTH" || !k ? null : k, ok: false };
}

/** Μπορεί ακόμα το μέλος να ζητήσει αλλαγή/ακύρωση; (έως 12 ώρες πριν) */
export function canRequestChange(startsAt: Date, now: Date, s: Settings): boolean {
  return startsAt.getTime() - now.getTime() >= s.changeRequestHours * 3_600_000;
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
