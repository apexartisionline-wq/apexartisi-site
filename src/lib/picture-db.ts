import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { memberGroups } from "./group-presence";
import { groupOccurrences } from "./groups";
import { cyclePeriod, cyclePeriodLabel, journalDate } from "./member";
import { soberDays } from "./note-form";
import {
  checkPicture, groupPicture, journalPicture, sessionPicture, shortDate,
  type CancelledItem, type MemberPicture, type MovedItem, type Period, type SessionItem,
} from "./picture";
import { sessionPresence } from "./presence";
import { getSettings } from "./settings";
import { addDays, localParts } from "./time";

/**
 * Φόρτωση της εικόνας μιας περιόδου (14/10) — η ΜΟΝΗ πηγή για «Με μια ματιά», φάκελο, «Συνέπεια».
 *  - «Εβδομάδα»: οι τελευταίες 7 ημέρες (back = 0) ή το προηγούμενο 7ήμερο (back = 1, 2, …).
 *  - «Μήνας»: ο κύκλος του μέλους (index = «Μήνας Ν», 1-based· null = ο τρέχων). Ατομικές = οι κρατήσεις του κύκλου·
 *    ομάδες και ημερολόγιο = το ημερολογιακό διάστημα του κύκλου (από την 1η ατομική ως την τελευταία ή ως σήμερα).
 * Ακυρώσεις/μεταφορές από το ιστορικό (booking_cancelled / booking_moved), μόνο ως πληροφορία.
 */
export type PeriodChoice = { kind: "week"; back: number } | { kind: "month"; index: number | null };

export type CycleOption = { index: number; label: string; open: boolean };
export type LoadedPicture = MemberPicture & { cycles: CycleOption[]; cycleId: string | null; programStartDate: string | null };

export function parsePeriod(sp: { p?: string; w?: string; m?: string }): PeriodChoice {
  if (sp.p === "month") {
    const i = Number(sp.m);
    return { kind: "month", index: Number.isInteger(i) && i >= 1 ? i : null };
  }
  const b = Number(sp.w);
  return { kind: "week", back: Number.isInteger(b) && b >= 0 && b <= 52 ? b : 0 };
}

export function periodQuery(c: PeriodChoice): string {
  return c.kind === "month" ? `p=month${c.index ? `&m=${c.index}` : ""}` : `p=week${c.back ? `&w=${c.back}` : ""}`;
}

type HistoryBefore = { date?: string; hour?: number; startsAt?: string; kind?: string; cycleId?: string | null; reason?: string; toDate?: string; toStartsAt?: string };

export async function picturesFor(memberIds: string[], choice: PeriodChoice, now = new Date()): Promise<Map<string, LoadedPicture>> {
  const out = new Map<string, LoadedPicture>();
  if (memberIds.length === 0) return out;
  const s = await getSettings();
  const today = localParts(now).date;
  const lastPossible = journalDate(now, s);
  const minutes = (kind: string) => (kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000;

  const members = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, programStartDate: true, soberSince: true } });
  const cycles = await prisma.cycle.findMany({
    where: { memberId: { in: memberIds } },
    orderBy: { startedAt: "asc" },
    include: { bookings: { select: { id: true, joinedAt: true, confirmedCame: true, slot: { select: { id: true, date: true, startsAt: true, kind: true, therapist: { select: { name: true } } } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  const cyclesOf = new Map<string, typeof cycles>();
  for (const c of cycles) cyclesOf.set(c.memberId, [...(cyclesOf.get(c.memberId) ?? []), c]);

  // Περίοδος ανά μέλος.
  type Plan = { period: Period; cycle: (typeof cycles)[number] | null; cycles: CycleOption[] };
  const plans = new Map<string, Plan>();
  for (const m of members) {
    const list = cyclesOf.get(m.id) ?? [];
    const cycleOptions: CycleOption[] = list.map((c, i) => ({ index: i + 1, label: `Μήνας ${i + 1} · ${cyclePeriodLabel(c, now)}`, open: !c.closedAt || (c.bookings.at(-1)?.slot.startsAt ?? now) > now }));
    if (choice.kind === "week") {
      const to = addDays(today, -7 * choice.back);
      const from = addDays(to, -6);
      const clipped = m.programStartDate && m.programStartDate > from ? m.programStartDate : null;
      plans.set(m.id, { period: { kind: "week", from, to, label: `${choice.back === 0 ? "Τελευταίες 7 ημέρες" : "7 ημέρες"} · ${shortDate(from)}–${shortDate(to)}`, open: choice.back === 0, clippedFrom: clipped }, cycle: null, cycles: cycleOptions });
    } else {
      const idx = choice.index && choice.index <= list.length ? choice.index : list.length;
      const cycle = list[idx - 1] ?? null;
      if (!cycle) {
        plans.set(m.id, { period: { kind: "month", from: today, to: today, label: "Δεν έχει ξεκινήσει κύκλος", open: false, clippedFrom: null }, cycle: null, cycles: cycleOptions });
        continue;
      }
      const { from, to } = cyclePeriod(cycle);
      const clipped = m.programStartDate && m.programStartDate > from ? m.programStartDate : null;
      plans.set(m.id, { period: { kind: "month", from, to, label: cycleOptions[idx - 1].label, open: cycleOptions[idx - 1].open, clippedFrom: clipped }, cycle, cycles: cycleOptions });
    }
  }
  const spans = [...plans.values()].map((p) => p.period);
  const minFrom = spans.reduce((a, p) => (p.from < a ? p.from : a), spans[0].from);
  const maxTo = spans.reduce((a, p) => (p.to > a ? p.to : a), spans[0].to);
  const groupsTo = maxTo < today ? maxTo : today;

  const [weekBookings, attendance, journal, history, soberChanges, occ] = await Promise.all([
    choice.kind === "week"
      ? prisma.booking.findMany({ where: { memberId: { in: memberIds }, slot: { date: { gte: minFrom, lte: maxTo } } }, select: { id: true, memberId: true, joinedAt: true, confirmedCame: true, slot: { select: { id: true, date: true, startsAt: true, kind: true, therapist: { select: { name: true } } } } } })
      : Promise.resolve([]),
    prisma.attendance.findMany({ where: { memberId: { in: memberIds }, date: { gte: minFrom, lte: groupsTo } }, select: { memberId: true, date: true, joinedAt: true } }),
    prisma.journalEntry.findMany({ where: { memberId: { in: memberIds }, date: { gte: minFrom, lte: maxTo } }, select: { memberId: true, date: true, mood: true, craving: true, sleepHours: true, confidence: true, used: true, selfHarm: true, goalCheck: true } }),
    prisma.recordHistory.findMany({ where: { memberId: { in: memberIds }, kind: { in: ["booking_cancelled", "booking_moved"] } }, select: { memberId: true, kind: true, before: true, byId: true, createdAt: true } }),
    prisma.sobrietyChange.findMany({ where: { memberId: { in: memberIds } }, orderBy: { at: "desc" }, select: { memberId: true, previous: true, date: true, byId: true, at: true, note: true } }),
    minFrom <= groupsTo ? groupOccurrences(minFrom, groupsTo, s, now) : Promise.resolve([]),
  ]);
  const byIds = [...new Set([...history.map((h) => h.byId), ...soberChanges.map((c) => c.byId)])];
  const names = new Map((byIds.length ? await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));

  for (const m of members) {
    const plan = plans.get(m.id)!;
    const { period, cycle } = plan;
    const inPeriod = (d: string) => d >= period.from && d <= period.to;
    const toItem = (b: { id: string; joinedAt: Date | null; confirmedCame: boolean | null; slot: { date: string; startsAt: Date; kind: string; therapist: { name: string } | null } }): SessionItem => ({
      id: b.id, date: b.slot.date, startsAt: b.slot.startsAt, pair: b.slot.kind === "PAIR", joinedAt: b.joinedAt, therapist: b.slot.therapist?.name ?? null,
      state: sessionPresence({ startsAt: b.slot.startsAt, endsAt: new Date(b.slot.startsAt.getTime() + minutes(b.slot.kind)), now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame }),
    });
    const sessionItems = (choice.kind === "week" ? weekBookings.filter((b) => b.memberId === m.id && inPeriod(b.slot.date)) : (cycle?.bookings ?? [])).map(toItem);
    // Ακυρώσεις/μεταφορές: εβδομάδα = κατά την ημερομηνία της θέσης· μήνας = κατά τον κύκλο.
    const cancelled: CancelledItem[] = [], moved: MovedItem[] = [];
    for (const h of history) {
      if (h.memberId !== m.id) continue;
      let b: HistoryBefore;
      try { b = JSON.parse(dec(h.before)) as HistoryBefore; } catch { continue; }
      if (!b.date || !b.startsAt) continue;
      const belongs = choice.kind === "week" ? inPeriod(b.date) : Boolean(cycle && b.cycleId === cycle.id);
      if (!belongs) continue;
      if (h.kind === "booking_cancelled") cancelled.push({ date: b.date, startsAt: new Date(b.startsAt), pair: b.kind === "PAIR", at: h.createdAt, by: names.get(h.byId) ?? "—", reason: b.reason ?? "" });
      else if (b.toDate && b.toStartsAt) moved.push({ date: b.date, startsAt: new Date(b.startsAt), toDate: b.toDate, toStartsAt: new Date(b.toStartsAt), at: h.createdAt, by: names.get(h.byId) ?? "—" });
    }
    const sessions = sessionPicture(sessionItems, { target: choice.kind === "month" && cycle ? cycle.length : null, cancelled, moved });

    const gTo = period.to < today ? period.to : today;
    const g = memberGroups(occ.filter((o) => o.date >= period.from && o.date <= gTo), attendance.filter((a) => a.memberId === m.id), { now, joinDate: m.programStartDate });
    const groups = groupPicture(g.rows.map((r) => ({ date: r.date, time: r.time, startsAt: r.startsAt, state: r.state })), { target: choice.kind === "month" && cycle ? s.groupsPerCycle : null });

    const jp = journalPicture(
      journal.filter((j) => j.memberId === m.id).map((j) => ({ date: j.date, mood: j.mood, craving: j.craving, sleep: j.sleepHours, confidence: j.confidence, used: j.used, selfHarm: j.selfHarm === "YES" || j.selfHarm === "UNSURE", goalCheck: j.goalCheck })),
      { from: period.from, to: period.to, lastPossible, startDate: m.programStartDate },
    );
    const sc = soberChanges.find((c) => c.memberId === m.id && c.date === m.soberSince) ?? null;
    let why: string | null = null;
    try { if (sc && dec(sc.note) === "Αρχική αξιολόγηση") why = "αρχική αξιολόγηση"; } catch { why = null; }
    const sober = { since: m.soberSince, days: soberDays(m.soberSince, today), setBy: sc ? names.get(sc.byId) ?? "—" : null, setAt: sc?.at ?? null, setWhy: why, previous: sc?.previous ?? null };

    const pic: LoadedPicture = { period, sessions, groups, journal: jp, sober, cycles: plan.cycles, cycleId: cycle?.id ?? null, programStartDate: m.programStartDate };
    const problems = checkPicture(pic);
    if (problems.length) {
      // Δεν πρέπει να συμβεί: οι ταυτότητες ελέγχονται και στις δοκιμές. Αν συμβεί, καταγράφεται για να διορθωθεί — ποτέ σιωπηλά.
      console.error(`[picture] ${m.id} ${period.kind}: ${problems.join("; ")}`);
      if (process.env.NODE_ENV === "test") throw new Error(problems.join("; "));
    }
    out.set(m.id, pic);
  }
  return out;
}

export async function memberPicture(memberId: string, choice: PeriodChoice, now = new Date()): Promise<LoadedPicture> {
  const p = (await picturesFor([memberId], choice, now)).get(memberId);
  if (!p) throw new Error("member not found");
  return p;
}

/** Και οι δύο εικόνες («τελευταίες 7 ημέρες» και ο τρέχων κύκλος), για τις οθόνες της ατομικής. */
export async function bothPictures(memberId: string, now = new Date()) {
  const [week, month] = await Promise.all([memberPicture(memberId, { kind: "week", back: 0 }, now), memberPicture(memberId, { kind: "month", index: null }, now)]);
  return { week, month };
}
