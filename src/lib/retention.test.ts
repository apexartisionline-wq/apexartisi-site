import { describe, expect, it } from "vitest";
import { addMonths, collaborationEnd, cutoff, expiresAt, memberDue, RETENTION } from "./retention";

const d = (s: string) => new Date(s);

describe("χρόνοι τήρησης (έγγραφο 13)", () => {
  it("οι χρόνοι του πίνακα", () => {
    expect(RETENTION.clinical.months).toBe(12);
    expect(RETENTION.registry.months).toBe(60);
    expect(RETENTION.risk.months).toBe(60);
    expect(RETENTION.unheld.months).toBe(6);
    expect(RETENTION.logs.months).toBe(6);
  });
  it("ημερολογιακοί μήνες, και στα τέλη μήνα", () => {
    expect(addMonths(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(d("2026-10-13T00:00:00Z"), 12).toISOString()).toBe("2027-10-13T00:00:00.000Z");
    expect(addMonths(d("2026-10-13T00:00:00Z"), -6).toISOString()).toBe("2026-04-13T00:00:00.000Z");
    expect(cutoff("logs", d("2026-10-13T00:00:00Z")).toISOString()).toBe("2026-04-13T00:00:00.000Z");
    expect(expiresAt("clinical", d("2026-10-13T00:00:00Z")).toISOString()).toBe("2027-10-13T00:00:00.000Z");
  });
  it("λήξη συνεργασίας: η τελευταία ολοκλήρωση· όχι αν ξεκίνησε νέος κύκλος μετά· όχι χωρίς ολοκλήρωση", () => {
    expect(collaborationEnd([], [{ startedAt: d("2026-01-01") }])).toBeNull();
    const closures = [{ createdAt: d("2026-03-01") }, { createdAt: d("2026-06-01") }];
    expect(collaborationEnd(closures, [{ startedAt: d("2026-01-01") }])?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(collaborationEnd(closures, [{ startedAt: d("2026-07-01") }])).toBeNull(); // επανασύνδεση
  });
  it("τι λήγει: 12 μήνες ο φάκελος, 5 έτη το μητρώο· τίποτα σε αναστολή διαγραφής", () => {
    const end = d("2025-01-10T00:00:00Z");
    expect(memberDue(end, d("2026-01-09T00:00:00Z"), false)).toEqual({ clinical: false, registry: false });
    expect(memberDue(end, d("2026-01-10T00:00:00Z"), false)).toEqual({ clinical: true, registry: false });
    expect(memberDue(end, d("2030-01-10T00:00:00Z"), false)).toEqual({ clinical: true, registry: true });
    expect(memberDue(end, d("2030-01-10T00:00:00Z"), true)).toEqual({ clinical: false, registry: false });
    expect(memberDue(null, d("2030-01-10T00:00:00Z"), false)).toEqual({ clinical: false, registry: false });
  });
});

describe("ειδοποιήσεις πριν τη διαγραφή (16/10)", () => {
  const now = d("2026-10-16T10:00:00Z");
  it("30 και 7 μέρες πριν, όχι μετά τη λήξη", async () => {
    const { noticesDue, daysLeft } = await import("./retention");
    expect(noticesDue(d("2026-12-20T10:00:00Z"), now)).toEqual([]);
    expect(noticesDue(d("2026-11-10T10:00:00Z"), now)).toEqual([30]);
    expect(noticesDue(d("2026-10-20T10:00:00Z"), now)).toEqual([30, 7]);
    expect(noticesDue(d("2026-10-16T09:00:00Z"), now)).toEqual([]);
    expect(daysLeft(d("2026-10-23T10:00:00Z"), now)).toBe(7);
  });
});
