import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as S } from "./settings";
import { athensToUtc, localParts, mondayOf } from "./time";
import {
  bookingWindow,
  canBook,
  canRequestChange,
  dropoutSince,
  isDropout,
  groupJoinable,
  helpNeedsEscalation,
  helpState,
  shortName,
  neededKind,
  pickSlot,
  programDay,
  rotationCoordinator,
  sessionJoinable,
} from "./program";

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
    const start = at("2026-09-29", 10);
    expect(sessionJoinable(start, at("2026-09-29", 9, 49), S)).toBe(false);
    expect(sessionJoinable(start, at("2026-09-29", 9, 50), S)).toBe(true);
    expect(sessionJoinable(start, at("2026-09-29", 10, 41), S)).toBe(false); // 40 λεπτά
    expect(groupJoinable(at("2026-09-30", 20, 50), S)).toBe(true); // Τετάρτη 21:00
    expect(groupJoinable(at("2026-09-30", 18), S)).toBe(false);
    expect(groupJoinable(at("2026-10-03", 17, 50), S)).toBe(true); // Σάββατο 18:00
    expect(groupJoinable(at("2026-10-01", 21), S)).toBe(false); // Πέμπτη
  });

  it("rotates the Friday coordinator every week", () => {
    const fri = { weekday: 5, time: "21:00", rotation: ["tzino", "christiana"] };
    expect(rotationCoordinator(fri, "2026-10-02", S)).toBe("tzino");
    expect(rotationCoordinator(fri, "2026-10-09", S)).toBe("christiana");
    expect(rotationCoordinator(fri, "2026-10-16", S)).toBe("tzino");
    expect(rotationCoordinator(fri, "2026-09-25", S)).toBe("christiana"); // πριν την αρχή μέτρησης
    expect(rotationCoordinator({ ...fri, rotation: [] }, "2026-10-02", S)).toBeNull();
  });

  it("alternates experiential and clinical therapists", () => {
    expect(neededKind("BIOMATIC")).toBe("CLINICAL");
    expect(neededKind("CLINICAL")).toBe("BIOMATIC");
    expect(neededKind(null)).toBeNull();
    const b = { id: "b", therapistKind: "BIOMATIC" as const };
    const c = { id: "c", therapistKind: "CLINICAL" as const };
    const both = { id: "m", therapistKind: "BOTH" as const };
    expect(pickSlot([b, c], "CLINICAL")).toMatchObject({ slot: c, kind: "CLINICAL", ok: true });
    expect(pickSlot([b, both], "CLINICAL")).toMatchObject({ slot: both, kind: "CLINICAL", ok: true });
    expect(pickSlot([b], "CLINICAL")).toMatchObject({ slot: b, kind: "BIOMATIC", ok: false });
    expect(pickSlot([both, c], null)).toMatchObject({ slot: c, ok: true });
    expect(pickSlot([], "CLINICAL")).toBeNull();
  });

  it("allows change requests until 12 hours before", () => {
    const start = at("2026-10-01", 18);
    expect(canRequestChange(start, at("2026-10-01", 6), S)).toBe(true);
    expect(canRequestChange(start, at("2026-10-01", 6, 1), S)).toBe(false);
  });

  it("tracks the red button after a claim", () => {
    const t0 = new Date("2026-09-26T20:00:00Z");
    const m = (x: number) => new Date(t0.getTime() + x * 60_000);
    const base = { createdAt: t0, lastNotifiedAt: t0, notifyCount: 1, claimedAt: m(2), talkedAt: null, resolvedAt: null, deliveryFailedAt: null };
    expect(helpState(base, m(6), S)).toMatchObject({ resend: false, showHelpline: false });
    expect(helpState(base, m(7), S)).toMatchObject({ resend: true, showHelpline: true });
    expect(helpState({ ...base, talkedAt: m(4) }, m(30), S)).toMatchObject({ resend: false, showHelpline: false });
    expect(helpState({ ...base, claimedAt: null, deliveryFailedAt: t0 }, m(1), S).showHelpline).toBe(true);
    expect(helpState({ ...base, claimedAt: null, notifyCount: 6 }, m(60), S).resend).toBe(false);
    expect(shortName("Νίκος Παπαδόπουλος")).toBe("Νίκος Π.");
  });

  it("escalates an unclaimed red-button request after 10 minutes", () => {
    const t0 = new Date("2026-09-26T20:00:00Z");
    const req = { createdAt: t0, notifyCount: 1, claimedAt: null, talkedAt: null, resolvedAt: null, deliveryFailedAt: null, lastNotifiedAt: t0 };
    expect(helpNeedsEscalation(req, new Date(t0.getTime() + 9 * 60_000), S)).toBe(false);
    expect(helpNeedsEscalation(req, new Date(t0.getTime() + 10 * 60_000), S)).toBe(true);
    expect(helpNeedsEscalation({ ...req, claimedAt: t0, talkedAt: t0 }, new Date(t0.getTime() + 60 * 60_000), S)).toBe(false);
  });

  it("flags a member with no contact for 3 days, once", () => {
    const now = at("2026-10-10", 10);
    const since = dropoutSince(now, 3);
    const base = { programStartDate: "2026-09-01", today: "2026-10-10", days: 3, since, openTask: false, recentTask: false };
    expect(isDropout({ ...base, lastContact: at("2026-10-07", 9) })).toBe(true);
    expect(isDropout({ ...base, lastContact: at("2026-10-07", 11) })).toBe(false);
    expect(isDropout({ ...base, lastContact: null })).toBe(true);
    expect(isDropout({ ...base, lastContact: null, openTask: true })).toBe(false);
    expect(isDropout({ ...base, lastContact: null, recentTask: true })).toBe(false);
    expect(isDropout({ ...base, lastContact: null, programStartDate: "2026-10-08" })).toBe(false); // μόλις ξεκίνησε
    expect(isDropout({ ...base, lastContact: null, programStartDate: null })).toBe(false);
  });
});
