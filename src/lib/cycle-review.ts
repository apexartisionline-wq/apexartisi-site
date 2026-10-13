import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { goalWeek } from "./goals";
import { memberNotes } from "./member-notes";
import { soberDays } from "./note-form";
import { cyclePeriod } from "./member";
import { getSettings } from "./settings";
import { addDays, localParts, mondayOf } from "./time";


/** Ο τελευταίος κύκλος που έχει ολοκληρώσει όλες τις ατομικές του (όλες έγιναν). */
export async function lastFinishedCycle(memberId: string, now = new Date()) {
  const cycles = await prisma.cycle.findMany({
    where: { memberId },
    orderBy: { startedAt: "desc" },
    take: 3,
    include: { bookings: { include: { slot: { select: { startsAt: true, date: true } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  return cycles.find((c) => c.bookings.length >= c.length && c.bookings.every((b) => b.slot.startsAt <= now)) ?? null;
}

/** Η εικόνα του κύκλου, μόνη της: ατομικές, ομάδες, ημερολόγιο, στόχοι εβδομάδας, κόκκινο κουμπί, νηφαλιότητα. */
export async function cyclePicture(memberId: string, cycle: NonNullable<Awaited<ReturnType<typeof lastFinishedCycle>>>) {
  // Ο «μήνας» ξεκινά από την 1η ατομική του κύκλου (ή από τη δημιουργία του, αν δεν έχει ακόμα).
  const { from, to } = cyclePeriod(cycle);
  const [member, groups, journal, help, relapses, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true } }),
    prisma.attendance.count({ where: { memberId, date: { gte: from, lte: to } } }),
    prisma.journalEntry.count({ where: { memberId, date: { gte: from, lte: to } } }),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${addDays(to, 1)}T00:00:00Z`) } } }),
    prisma.sobrietyChange.count({ where: { memberId, at: { gte: new Date(`${from}T00:00:00Z`) } } }),
    getSettings(),
  ]);
  const days = Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const g = await goalWeek(memberId, w);
    if (g.goal) weeks.push({ week: w, text: g.goal.text, yes: g.days.filter((d) => d.check === "YES").length, partly: g.days.filter((d) => d.check === "PARTLY").length, no: g.days.filter((d) => d.check === "NO").length });
  }
  return {
    from,
    to,
    // done: όσες ατομικές του κύκλου πέρασαν (προπληρωμένες, μετράνε κανονικά)· came: όσες ήρθε πραγματικά (συνέπεια).
    sessions: { done: Math.min(cycle.length, cycle.bookings.filter((b) => b.slot.startsAt <= new Date()).length), came: cycle.bookings.filter((b) => b.joinedAt).length, total: cycle.length },
    groups: { came: groups, total: s.groupsPerCycle },
    journal: { written: journal, days },
    help,
    relapses,
    soberDays: soberDays(member.soberSince, to < localParts(new Date()).date ? to : localParts(new Date()).date),
    weeks,
  };
}

export async function cycleReviews(memberId: string) {
  const rows = await prisma.cycleReview.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 12 });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, cycleId: r.cycleId, goals: dec(r.goals), memberSays: dec(r.memberSays), at: r.createdAt, author: names.get(r.authorId) ?? "" }));
}

export async function saveCycleReview(memberId: string, cycleId: string, authorId: string, goals: string, memberSays: string) {
  await prisma.cycleReview.create({ data: { memberId, cycleId, authorId, goals: enc(goals), memberSays: enc(memberSays) } });
}

/** Μέλη που τελείωσαν κύκλο χωρίς ανασκόπηση (για το «Να το δεις» όλης της ομάδας). */
export async function dueCycleReviews(memberIds: string[]) {
  const out: { memberId: string; cycleId: string }[] = [];
  for (const id of memberIds) {
    const c = await lastFinishedCycle(id);
    if (c && !(await prisma.cycleReview.findFirst({ where: { cycleId: c.id }, select: { id: true } }))) out.push({ memberId: id, cycleId: c.id });
  }
  return out;
}

/**
 * Δομή σύνοψης κύκλου (13/10): ΜΟΝΟ δεδομένα που υπολογίζονται με σαφείς κανόνες, με διακριτές πηγές,
 * οργανωμένα στις τέσσερις ενότητες μιας μελλοντικής σύνοψης. Δεν καλεί καμία εξωτερική υπηρεσία·
 * δεν παράγει κείμενο· δεν ερμηνεύει. Αν προστεθεί AI αργότερα, θα διαβάζει αυτή τη δομή (μόνο του μέλους,
 * μόνο της περιόδου), θα παραπέμπει στις πηγές, θα εμφανίζεται ως προσχέδιο προς έλεγχο και θα θέλει έγκριση.
 */
export type CycleSummaryData = Awaited<ReturnType<typeof cycleSummaryData>>;
export async function cycleSummaryData(memberId: string, cycle: NonNullable<Awaited<ReturnType<typeof lastFinishedCycle>>>) {
  const { from, to } = cyclePeriod(cycle);
  const fromAt = new Date(`${from}T00:00:00Z`);
  const toAt = new Date(`${addDays(to, 1)}T00:00:00Z`);
  const [pic, notes, journal, assignments, review] = await Promise.all([
    cyclePicture(memberId, cycle),
    memberNotes(memberId, { since: fromAt, before: toAt }),
    prisma.journalEntry.findMany({ where: { memberId, date: { gte: from, lte: to } }, select: { date: true, mood: true, craving: true, sleepHours: true, used: true, selfHarm: true, win: true }, orderBy: { date: "asc" } }),
    prisma.assignment.findMany({ where: { memberId, createdAt: { gte: fromAt, lt: toAt } }, select: { id: true, title: true, step: true, answeredAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.cycleReview.findFirst({ where: { cycleId: cycle.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const slotTherapists = new Map((await prisma.slot.findMany({ where: { id: { in: cycle.bookings.map((b) => b.slotId) } }, select: { id: true, kind: true, therapist: { select: { name: true } } } })).map((x) => [x.id, x]));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const reviewer = review ? await prisma.user.findUnique({ where: { id: review.authorId }, select: { name: true } }) : null;
  return {
    period: { from, to, days: pic.journal.days },
    // Ποια ήταν η συμμετοχή — με διακριτές πηγές.
    participation: {
      sessions: cycle.bookings.map((b) => ({
        date: b.slot.date,
        kind: slotTherapists.get(b.slotId)?.kind === "PAIR" ? "Therapair" : "Ατομική",
        therapist: slotTherapists.get(b.slotId)?.therapist?.name ?? "",
        came: Boolean(b.joinedAt),
        source: b.joinedAt ? "μετρά «ήρθε» (κουμπί «Μπες» ή σημείωμα «Ήρθε»)" : "καμία καταγραφή παρουσίας",
        hasNote: notes.some((n) => n.slotId === b.slotId),
      })),
      groups: { came: pic.groups.came, total: pic.groups.total, source: "κουμπί «Μπες στην ομάδα» ή διόρθωση από τη διαχείριση" },
      journal: { written: journal.length, days: pic.journal.days, source: "εγγραφές ημερολογίου ανάκαμψης του μέλους" },
      help: { count: pic.help, source: "πατήματα του κόκκινου κουμπιού" },
    },
    // Τι καταγράφηκε ως πρόοδος ή δυσκολία — μόνο μετρήσεις και καταγραφές, χωρίς ερμηνεία.
    recorded: {
      mood: avg(journal.map((j) => j.mood)), craving: avg(journal.map((j) => j.craving)), sleep: avg(journal.map((j) => j.sleepHours)),
      usedDays: journal.filter((j) => j.used).map((j) => j.date),
      selfHarmDays: journal.filter((j) => j.selfHarm === "YES" || j.selfHarm === "UNSURE").map((j) => j.date),
      wins: journal.map((j) => ({ date: j.date, text: dec(j.win) })).filter((w) => w.text),
      soberDays: pic.soberDays, relapses: pic.relapses,
      source: "ημερολόγιο ανάκαμψης και ημερομηνία νηφαλιότητας του φακέλου",
    },
    // Τι δουλέψαμε — τα σημειώματα των θεραπευτών (πηγή: κάθε σημείωμα με ημερομηνία και συντάκτη).
    worked: {
      notes: notes.map((n) => ({ slotId: n.slotId, date: n.date, therapist: n.therapist, pair: n.pair, riskChange: n.riskChange, usedSince: n.usedSince, handover: n.handover })),
      goals: pic.weeks,
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, step: a.step, answered: Boolean(a.answeredAt) })),
      source: "σημειώματα ατομικών/Therapair, στόχοι εβδομάδας, εργασίες",
    },
    // Τι χρειάζεται συνέχεια — τα πεδία συνέχειας του τελευταίου σημειώματος, όπως γράφτηκαν.
    next: {
      from: notes[0] ? { date: notes[0].date, therapist: notes[0].therapist, handover: notes[0].handover } : null,
      source: "το τελευταίο σημείωμα του κύκλου (καρτέλα «Συνέχεια»)",
    },
    // Ανθρώπινη ανασκόπηση (2 γραμμές) — αν υπάρχει.
    review: review ? { goals: dec(review.goals), memberSays: dec(review.memberSays), at: review.createdAt, author: reviewer?.name ?? "" } : null,
    // Προσχέδιο σύνοψης: δεν υπάρχει. Θα γραφεί από άνθρωπο ή (μελλοντικά) θα προταθεί ως προσχέδιο προς έγκριση.
    draft: null as null,
  };
}
