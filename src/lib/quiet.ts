import { addDays, athensToUtc, localParts } from "./time";

/** Ήσυχες ώρες για τα μέλη: τίποτα μετά τις 22:00 και πριν τις 08:00 (εκτός από το κόκκινο κουμπί). */
export function quietUntil(now = new Date()): Date | null {
  const p = localParts(now);
  if (p.hour >= 22) return athensToUtc(addDays(p.date, 1), 8);
  if (p.hour < 8) return athensToUtc(p.date, 8);
  return null;
}
