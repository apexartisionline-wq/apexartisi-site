// Όλες οι ώρες του προγράμματος είναι ώρα Ελλάδας, ανεξάρτητα από τον server.
export const TZ = "Europe/Athens";

export type LocalParts = {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  weekday: number; // 0 = Κυριακή … 6 = Σάββατο
};

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday],
  };
}

/** Μετατρέπει ώρα Ελλάδας (ημερομηνία + ώρα:λεπτά) σε πραγματική στιγμή (UTC). */
export function athensToUtc(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const seen = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    const diff = wanted - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Η Δευτέρα της εβδομάδας στην οποία ανήκει η ημερομηνία. */
export function mondayOf(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

/** "HH:MM" → λεπτά από τα μεσάνυχτα. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const DAY_NAMES = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

export function formatDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${DAY_NAMES[weekdayOf(date)]} ${Number(d)}/${Number(m)}`;
}

export function formatHour(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime(d: Date): string {
  const p = localParts(d);
  return formatHour(p.hour, p.minute);
}

export function isAfterLocal(p: LocalParts, hhmm: string): boolean {
  return p.hour * 60 + p.minute >= toMinutes(hhmm);
}

/** Στιγμή σε ώρα Ελλάδας, με την ίδια μορφή παντού: «Τρίτη 6/10 09:00». */
export function formatWhen(d: Date): string {
  const p = localParts(d);
  return `${formatDate(p.date)} ${formatHour(p.hour, p.minute)}`;
}
