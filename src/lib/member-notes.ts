import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { hideOther, nameVariants } from "./pair-note";
import { vocative } from "./vocative";

// Τα σημειώματα ενός μέλους, από όλους τους θεραπευτές: ατομικές (κοινό σημείωμα της θέσης) και
// Therapair (μόνο το δικό του σημείωμα — ποτέ του άλλου μέλους).
export type MemberNote = {
  id: string;
  slotId: string;
  date: string;
  hour: number;
  startsAt: Date;
  pair: boolean;
  therapistId: string;
  therapist: string;
  text: string;
  next: string;
  riskChange: string | null;
  usedSince: string | null;
  createdAt: Date;
};

type Opts = { before?: Date; since?: Date; excludeSlot?: string; take?: number };

export async function memberNotes(memberId: string, o: Opts = {}): Promise<MemberNote[]> {
  const startsAt = { ...(o.before ? { lt: o.before } : {}), ...(o.since ? { gte: o.since } : {}) };
  const slotWhere = { ...(o.excludeSlot ? { id: { not: o.excludeSlot } } : {}), ...(o.before || o.since ? { startsAt } : {}) };
  const sel = { therapist: { select: { id: true, name: true } }, slot: { select: { id: true, date: true, hour: true, startsAt: true } } } as const;
  const [single, pair] = await Promise.all([
    // Στα Therapair δεν διαβάζουμε το παλιό κοινό σημείωμα θέσης (θα είχε και στοιχεία του άλλου).
    prisma.sessionNote.findMany({
      where: { slot: { ...slotWhere, kind: { not: "PAIR" }, bookings: { some: { memberId } } } },
      include: sel,
      orderBy: { slot: { startsAt: "desc" } },
      ...(o.take ? { take: o.take } : {}),
    }),
    prisma.pairNote.findMany({
      where: { memberId, slot: slotWhere },
      include: { ...sel, slot: { select: { id: true, date: true, hour: true, startsAt: true, bookings: { where: { memberId: { not: memberId } }, select: { member: { select: { name: true } } } } } } },
      orderBy: { slot: { startsAt: "desc" } },
      ...(o.take ? { take: o.take } : {}),
    }),
  ]);
  // Δεύτερη δικλίδα στην ανάγνωση: ακόμα κι αν κάποιο παλιό σημείωμα Therapair έχει το όνομα του άλλου, δεν φαίνεται.
  const others = new Map(pair.map((n) => [n.id, n.slot.bookings.flatMap((b) => nameVariants(b.member.name, vocative))]));
  const safe = (id: string, t: string) => (others.get(id)?.length ? hideOther(t, others.get(id)!) : t);
  const rows = [
    ...single.map((n) => ({ n, pair: false })),
    ...pair.map((n) => ({ n, pair: true })),
  ].map(({ n, pair: isPair }) => ({
    id: n.id,
    slotId: n.slot.id,
    date: n.slot.date,
    hour: n.slot.hour,
    startsAt: n.slot.startsAt,
    pair: isPair,
    therapistId: n.therapist.id,
    therapist: n.therapist.name,
    text: isPair ? safe(n.id, dec(n.content)) : dec(n.content),
    next: isPair ? safe(n.id, dec(n.nextStep)) : dec(n.nextStep),
    riskChange: n.riskChange,
    usedSince: n.usedSince,
    createdAt: n.createdAt,
  }));
  rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return o.take ? rows.slice(0, o.take) : rows;
}

/** Υπάρχει σημείωμα αυτού του μέλους για αυτή τη θέση; (ατομική ή το δικό του Therapair) */
export async function noteForSlot(memberId: string, slotId: string, kind: string) {
  if (kind === "PAIR") return prisma.pairNote.findUnique({ where: { slotId_memberId: { slotId, memberId } }, include: { therapist: { select: { name: true } } } });
  return prisma.sessionNote.findUnique({ where: { slotId }, include: { therapist: { select: { name: true } } } });
}
