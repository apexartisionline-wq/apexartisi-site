import { describe, expect, it } from "vitest";
import { dayTimeline, type DayItem } from "./member-day";

const at = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00Z`);

const items: DayItem[] = [
  { key: "j", at: at("20:00"), title: "Ημερολόγιο" },
  { key: "t", at: at("09:00"), title: "Ξυπνάμε παρέα" },
  { key: "g", at: at("21:00"), opensAt: at("20:50"), endsAt: at("22:30"), title: "Ομάδα" },
  { key: "s", at: at("12:00"), opensAt: at("11:55"), endsAt: at("12:50"), title: "Ατομική" },
];

describe("dayTimeline", () => {
  it("βάζει τα πάντα σε σειρά ώρας", () => {
    expect(dayTimeline(items, at("08:00")).map((x) => x.item.key)).toEqual(["t", "s", "j", "g"]);
  });

  it("το μεσημέρι: κείμενο ανοιχτό, ατομική τώρα (και 5′ πριν), τα υπόλοιπα έρχονται", () => {
    const st = (now: string) => Object.fromEntries(dayTimeline(items, at(now)).map((x) => [x.item.key, x.state]));
    expect(st("11:56")).toEqual({ t: "open", s: "now", j: "later", g: "later" });
    expect(st("12:30").s).toBe("now");
  });

  it("ό,τι πέρασε χωρίς ✓ γίνεται ήπιο· με ✓ μένει ✓", () => {
    const st = (list: DayItem[]) => Object.fromEntries(dayTimeline(list, at("23:00")).map((x) => [x.item.key, x.state]));
    expect(st(items)).toEqual({ t: "open", s: "past", j: "open", g: "past" });
    expect(st(items.map((i) => ({ ...i, done: i.key !== "t" })))).toEqual({ t: "open", s: "done", j: "done", g: "done" });
  });

  it("✓ δεν μετρά πριν ανοίξει", () => {
    expect(dayTimeline([{ ...items[0], done: true }], at("19:00"))[0].state).toBe("later");
  });
});
