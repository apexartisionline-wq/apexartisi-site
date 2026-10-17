import "server-only";
import { prisma } from "./db";
import { isDemoDaySlot } from "./demo-day";
import { isDemoSite } from "./demo-session";
import { groupOccurrences } from "./groups";
import { getSettings } from "./settings";
import { addDays, athensToUtc, localParts } from "./time";
import { NOTE_GATE_DAYS, NOTE_GATE_FROM, noteGate, type GateSlot, type PendingNote } from "./note-gate-rules";

const FROM = athensToUtc(NOTE_GATE_FROM, 0, 0);

const shortName = (name: string) => name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ");

/** Συνεδρίες ενός θεραπευτή για την πύλη: τις τελευταίες NOTE_GATE_DAYS μέρες και ως το τέλος της σημερινής μέρας. */
async function gateSlots(therapistIds: string[], now: Date): Promise<(GateSlot & { therapistId: string; therapistName: string })[]> {
  const today = localParts(now).date;
  const rows = await prisma.slot.findMany({
    where: { therapistId: { in: therapistIds }, bookings: { some: {} }, date: { gte: addDays(today, -NOTE_GATE_DAYS), lte: today } },
    select: {
      id: true, kind: true, startsAt: true, therapistId: true, hour: true, position: true,
      therapist: { select: { name: true, username: true } },
      note: { select: { id: true } },
      pairNotes: { select: { id: true } },
      bookings: { select: { member: { select: { name: true, username: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "PAIR" ? "PAIR" : "INDIVIDUAL",
    startsAt: r.startsAt,
    hasNote: r.kind === "PAIR" ? r.pairNotes.length > 0 : Boolean(r.note),
    who: r.bookings.map((b) => shortName(b.member.name)).join(" & "),
    demo: isDemoDaySlot({ hour: r.hour, position: r.position, therapistUsername: r.therapist?.username ?? null, memberUsernames: r.bookings.map((b) => b.member.username) }),
    therapistId: r.therapistId ?? "",
    therapistName: r.therapist?.name ?? "",
  }));
}

/** Η πύλη για έναν θεραπευτή: ποιες συνεδρίες εκκρεμούν και αν κλειδώνει τώρα. */
export async function therapistNoteGate(user: { id: string; role: string }, now = new Date()): Promise<{ pending: PendingNote[]; blocked: boolean }> {
  if (user.role !== "THERAPIST") return { pending: [], blocked: false };
  const s = await getSettings();
  const today = localParts(now).date;
  const [slots, occ] = await Promise.all([gateSlots([user.id], now), groupOccurrences(today, today, s, now)]);
  const groups = occ.filter((o) => o.coordinatorId === user.id && !o.notHeld).map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt }));
  return noteGate({ now, slots, groups, sessionMinutes: s.sessionMinutes, pairMinutes: s.pairMinutes, joinBeforeMinutes: s.sessionJoinBeforeMinutes, excludeDemo: isDemoSite(), from: FROM });
}

/** Για τη διαχείριση: όλα τα σημειώματα που εκκρεμούν (7 μέρες), ανά θεραπευτή — χωρίς κλείδωμα. */
export async function pendingNotesAll(now = new Date()): Promise<(PendingNote & { therapistId: string; therapistName: string })[]> {
  const s = await getSettings();
  const staff = await prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, select: { id: true } });
  const slots = await gateSlots(staff.map((u) => u.id), now);
  const byT = new Map<string, typeof slots>();
  for (const sl of slots) { const l = byT.get(sl.therapistId) ?? []; l.push(sl); byT.set(sl.therapistId, l); }
  const out: (PendingNote & { therapistId: string; therapistName: string })[] = [];
  for (const [therapistId, list] of byT) {
    const g = noteGate({ now, slots: list, groups: [], sessionMinutes: s.sessionMinutes, pairMinutes: s.pairMinutes, joinBeforeMinutes: s.sessionJoinBeforeMinutes, excludeDemo: isDemoSite(), from: FROM });
    for (const p of g.pending) out.push({ ...p, therapistId, therapistName: list[0]?.therapistName ?? "" });
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
