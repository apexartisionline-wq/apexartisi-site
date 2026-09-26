import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S } from "./settings";
import { athensToUtc, localParts, mondayOf } from "./time";
import { bookingWindow, canBook, groupJoinable, helpNeedsEscalation, programDay, sessionJoinable } from "./program";

const at = (date: string, h: number, m = 0) => athensToUtc(date, h, m);

describe("time", () => {
  it("converts Athens time both in summer and winter", () => {
    expect(at("2026-07-01", 9).toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(at("2026-12-01", 9).toISOString()).toBe("2026-12-01T07:00:00.000Z");
    expect(localParts(at("2026-09-28", 21, 5))).toMatchObject({ date: "2026-09-28", hour: 21, minute: 5, weekday: 1 });
  });
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-09-26")).toBe("2026-09-21"); // Σάββατο
    expect(mondayOf("2026-09-27")).toBe("2026-09-21"); // Κυριακή
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
  });
});

describe("program", () => {
  it("counts the program day", () => {
    expect(programDay("2026-09-01", "2026-09-01")).toBe(1);
    expect(programDay("2026-09-01", "2026-09-26")).toBe(26);
    expect(programDay(null, "2026-09-26")).toBeNull();
  });

  it("opens bookings on Monday and closes them at 21:00", () => {
    expect(bookingWindow(at("2026-09-28", 20, 59), S).open).toBe(true);
    expect(bookingWindow(at("2026-09-28", 21, 0), S).open).toBe(false);
    expect(bookingWindow(at("2026-09-29", 10), S).open).toBe(false);
    expect(bookingWindow(at("2026-09-28", 10), S)).toMatchObject({ weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  });

  it("enforces the booking rules", () => {
    const now = at("2026-09-28", 12);
    const slot = { id: "s", date: "2026-09-30", startsAt: at("2026-09-30", 17), therapistId: "t", booked: false };
    expect(canBook({ now, settings: S, slot, memberBookingsThisWeek: [] }).ok).toBe(true);
    expect(canBook({ now, settings: S, slot, memberBookingsThisWeek: [{ date: "2026-09-29" }, { date: "2026-10-01" }] }).ok).toBe(false);
    expect(canBook({ now, settings: S, slot, memberBookingsThisWeek: [{ date: "2026-09-30" }] }).ok).toBe(false);
    expect(canBook({ now, settings: S, slot: { ...slot, therapistId: null }, memberBookingsThisWeek: [] }).ok).toBe(false);
    expect(canBook({ now, settings: S, slot: { ...slot, booked: true }, memberBookingsThisWeek: [] }).ok).toBe(false);
    expect(canBook({ now: at("2026-09-28", 21, 30), settings: S, slot, memberBookingsThisWeek: [] }).ok).toBe(false);
  });

  it("opens the join buttons at the right time", () => {
    const start = at("2026-09-30", 17);
    expect(sessionJoinable(start, at("2026-09-30", 16, 49), S)).toBe(false);
    expect(sessionJoinable(start, at("2026-09-30", 16, 50), S)).toBe(true);
    expect(sessionJoinable(start, at("2026-09-30", 17, 51), S)).toBe(false);
    expect(groupJoinable(at("2026-09-30", 17, 50), S)).toBe(true); // Τετάρτη
    expect(groupJoinable(at("2026-10-01", 18), S)).toBe(false); // Πέμπτη
  });

  it("escalates an unclaimed red-button request after 10 minutes", () => {
    const t0 = new Date("2026-09-26T20:00:00Z");
    const req = { claimedAt: null, resolvedAt: null, lastNotifiedAt: t0 };
    expect(helpNeedsEscalation(req, new Date(t0.getTime() + 9 * 60_000), S)).toBe(false);
    expect(helpNeedsEscalation(req, new Date(t0.getTime() + 10 * 60_000), S)).toBe(true);
    expect(helpNeedsEscalation({ ...req, claimedAt: t0 }, new Date(t0.getTime() + 60 * 60_000), S)).toBe(false);
  });
});
