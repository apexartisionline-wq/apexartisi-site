import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { goalWeek } from "./goals";
import { memberNotes } from "./member-notes";
import { soberDays } from "./note-form";
import { bookingCame, PRESENCE_LABEL, countPresence, sessionPresence } from "./presence";
import { groupOccurrences } from "./groups";
import { memberGroups } from "./group-presence";
import { cyclePeriod, cyclePeriodLabel } from "./member";
import { getSettings } from "./settings";
import { addDays, localParts, mondayOf } from "./time";
import { cycleIsComplete, type CycleProgress } from "./cycle-rules";


type CycleRow = { id: string; length: number; startedAt: Date; closedAt: Date | null; bookings: { slot: { startsAt: Date; date: string } }[] };

/** Πόσες ομάδες του πραγματικού προγράμματος πέρασαν μέσα στον κύκλο (από την έναρξή του, μετά την ένταξη, χωρίς «δεν έγινε»). */
export async function cycleGroupsPassed(memberId: string, cycle: CycleRow, now = new Date()): Promise<number> {
  const s = await getSettings();
  const { from, to } = cyclePeriod(cycle);
  const today = localParts(now).date;
  if (from > today) return 0;
  const [member, occ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { programStartDate: true } }),
    groupOccurrences(from, to < today ? to : today, s, now),
  ]);
  return occ.filter((o) => !o.notHeld && o.endsAt <= now && (!member.programStartDate || o.date >= member.programStartDate)).length;
}

/** Η πρόοδος ενός κύκλου προς το κλείσιμο: ατομικές που πέρασαν / προβλεπόμενες, ομάδες που πέρασαν / προβλεπόμενες. */
export async function cycleProgress(memberId: string, cycle: CycleRow, now = new Date()): Promise<CycleProgress> {
  const s = await getSettings();
  return {
    sessionsPassed: cycle.bookings.filter((b) => b.slot.startsAt <= now).length,
    sessionsTotal: cycle.length,
    groupsPassed: await cycleGroupsPassed(memberId, cycle, now),
    groupsTotal: s.groupsPerCycle,
  };
}

/**
 * Ο τελευταίος κύκλος που έχει τελειώσει (απόφαση 14/10): ΚΑΙ οι ατομικές του (όλες προγραμματισμένες και πέρασε η ώρα τους)
 * ΚΑΙ οι ομάδες του (όσες προβλέπει ο κύκλος πέρασαν από την έναρξή του). Μέχρι τότε δεν ανοίγει το κλείσιμο.
 */
export async function lastFinishedCycle(memberId: string, now = new Date()) {
  const cycles = await prisma.cycle.findMany({
    where: { memberId },
    orderBy: { startedAt: "desc" },
    take: 3,
    include: { bookings: { include: { slot: { select: { startsAt: true, date: true, kind: true, note: { select: { id: true } } } } }, orderBy: { slot: { startsAt: "asc" } } } },
  });
  for (const c of cycles) {
    if (!(c.bookings.length >= c.length && c.bookings.every((b) => b.slot.startsAt <= now))) continue;
    if (cycleIsComplete(await cycleProgress(memberId, c, now))) return c;
  }
  return null;
}

/** Ο τρέχων (τελευταίος) κύκλος με την πρόοδό του — για να φαίνεται «πόσο απέχει» το κλείσιμο. */
export async function currentCycleProgress(memberId: string, now = new Date()) {
  const c = await prisma.cycle.findFirst({ where: { memberId }, orderBy: { startedAt: "desc" }, include: { bookings: { select: { slot: { select: { startsAt: true, date: true } } }, orderBy: { slot: { startsAt: "asc" } } } } });
  return c ? { cycle: c, progress: await cycleProgress(memberId, c, now) } : null;
}

/** Η εικόνα του κύκλου, μόνη της: ατομικές, ομάδες, ημερολόγιο, στόχοι εβδομάδας, κόκκινο κουμπί, νηφαλιότητα. */
type PicCycle = { length: number; startedAt: Date; closedAt: Date | null; bookings: { joinedAt: Date | null; confirmedCame: boolean | null; slot: { startsAt: Date; date: string; kind?: "INDIVIDUAL" | "PAIR" } }[] };
export async function cyclePicture(memberId: string, cycle: PicCycle) {
  // Ο «μήνας» ξεκινά από την 1η ατομική του κύκλου (ή από τη δημιουργία του, αν δεν έχει ακόμα).
  const { from, to } = cyclePeriod(cycle);
  const [member, att, journal, help, relapses, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { soberSince: true, programStartDate: true } }),
    prisma.attendance.findMany({ where: { memberId, date: { gte: from, lte: to } }, select: { date: true, joinedAt: true } }),
    prisma.journalEntry.count({ where: { memberId, date: { gte: from, lte: to } } }),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${addDays(to, 1)}T00:00:00Z`) } } }),
    prisma.sobrietyChange.count({ where: { memberId, at: { gte: new Date(`${from}T00:00:00Z`) } } }),
    getSettings(),
  ]);
  // Ομάδες: από το πραγματικό πρόγραμμα της περιόδου (όχι κάθε «συνήθης» μέρα), μετά την ένταξη, όσες έληξαν και δεν ακυρώθηκαν.
  const todayD = localParts(new Date()).date;
  const occ = from <= todayD ? await groupOccurrences(from, to < todayD ? to : todayD, s) : [];
  const grp = memberGroups(occ, att, { now: new Date(), joinDate: member.programStartDate });
  const now = new Date();
  const presence = countPresence(cycle.bookings.map((b) => sessionPresence({
    startsAt: b.slot.startsAt,
    endsAt: new Date(b.slot.startsAt.getTime() + (b.slot.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000),
    now, joinedAt: b.joinedAt, confirmedCame: b.confirmedCame,
  })));
  const days = Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const g = await goalWeek(memberId, w);
    if (g.goal) weeks.push({ week: w, text: g.goal.text, yes: g.days.filter((d) => d.check === "YES").length, partly: g.days.filter((d) => d.check === "PARTLY").length, no: g.days.filter((d) => d.check === "NO").length });
  }
  return {
    from,
    to,
    // done: όσες ατομικές του κύκλου πέρασε η προγραμματισμένη ώρα τους (ΟΧΙ «έγιναν»)· came: «ήρθε» κατά τον υπάρχοντα κανόνα
    // (επιβεβαιωμένη παρουσία ή πάτημα «Μπες»)· total: όσες προβλέπει ο κύκλος. Η ανάλυση στο presence.
    // done: προγραμματισμένες που πέρασαν (ΟΧΙ «έγιναν»)· came: παρουσίες (επιβεβαίωση ή «Από σύνδεση»)· total: όσες προβλέπει ο κύκλος.
    sessions: { done: Math.min(cycle.length, presence.timePassed), came: presence.counted, total: cycle.length },
    presence,
    periodLabel: cyclePeriodLabel({ startedAt: cycle.startedAt, closedAt: cycle.closedAt, bookings: cycle.bookings }),
    // came: παρουσίες· passed: προγραμματισμένες που πέρασαν· total: όσες προβλέπει ο κύκλος (16).
    groups: { came: grp.counted, passed: grp.passed, noRecord: grp.noRecord, total: s.groupsPerCycle },
    journal: { written: journal, days },
    help,
    relapses,
    soberDays: soberDays(member.soberSince, to < localParts(new Date()).date ? to : localParts(new Date()).date),
    weeks,
  };
}

export type CycleArchive = { pic: Awaited<ReturnType<typeof cyclePicture>>; data: CycleSummaryData } | null;
export async function cycleReviews(memberId: string) {
  const rows = await prisma.cycleReview.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 12 });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const parse = (raw: string): CycleArchive => { if (!raw) return null; try { return JSON.parse(dec(raw)) as CycleArchive; } catch { return null; } };
  return rows.map((r) => ({ id: r.id, cycleId: r.cycleId, goals: dec(r.goals), memberSays: dec(r.memberSays), note: dec(r.note), archive: parse(r.summary), at: r.createdAt, author: names.get(r.authorId) ?? "" }));
}

/**
 * Κλείσιμο κύκλου (απόφαση 14/10): το στιγμιότυπο της αυτόματης σύνοψης (όπως ήταν τη στιγμή του κλεισίματος) και το
 * προαιρετικό «κάτι επιπλέον» αρχειοθετούνται στον φάκελο του μέλους. Καμία ερμηνεία, κανένα AI.
 */
export async function closeCycle(memberId: string, cycle: NonNullable<Awaited<ReturnType<typeof lastFinishedCycle>>>, authorId: string, note: string) {
  const [pic, data] = await Promise.all([cyclePicture(memberId, cycle), cycleSummaryData(memberId, cycle)]);
  const snapshot = JSON.stringify({ pic, data });
  await prisma.$transaction([
    prisma.cycleReview.create({ data: { memberId, cycleId: cycle.id, authorId, goals: enc(""), memberSays: enc(""), note: enc(note), summary: enc(snapshot) } }),
    prisma.cycle.updateMany({ where: { id: cycle.id, closedAt: null }, data: { closedAt: new Date() } }),
  ]);
}

/** Παλιά μορφή (πριν 14/10): δύο γραμμές. Μένει για τα παλιά δεδομένα και τα tests. */
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
  const s = await getSettings();
  const [pic, notes, journal, assignments, review, forms] = await Promise.all([
    cyclePicture(memberId, cycle),
    memberNotes(memberId, { since: fromAt, before: toAt }),
    prisma.journalEntry.findMany({ where: { memberId, date: { gte: from, lte: to } }, select: { date: true, mood: true, craving: true, sleepHours: true, used: true, selfHarm: true, win: true }, orderBy: { date: "asc" } }),
    prisma.assignment.findMany({ where: { memberId, createdAt: { gte: fromAt, lt: toAt } }, select: { id: true, title: true, step: true, answeredAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.cycleReview.findFirst({ where: { cycleId: cycle.id }, orderBy: { createdAt: "desc" } }),
    // Θεματικές της περιόδου: από τους τίτλους των φορμών («Πίστη: …» → «Πίστη»), όπως στο μήνυμα μήνα.
    prisma.content.findMany({ where: { kind: "FORM", date: { gte: from, lte: to } }, orderBy: { date: "asc" }, select: { title: true, date: true } }),
  ]);
  const themes = [...new Set(forms.map((f) => (f.title.includes(":") ? f.title.split(":")[0].trim() : f.title.trim())).filter(Boolean))];
  const slotTherapists = new Map((await prisma.slot.findMany({ where: { id: { in: cycle.bookings.map((b) => b.slotId) } }, select: { id: true, kind: true, therapist: { select: { name: true } } } })).map((x) => [x.id, x]));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const reviewer = review ? await prisma.user.findUnique({ where: { id: review.authorId }, select: { name: true } }) : null;
  const statesBy = new Map(cycle.bookings.map((b) => [b.id, sessionPresence({
    startsAt: b.slot.startsAt,
    endsAt: new Date(b.slot.startsAt.getTime() + (slotTherapists.get(b.slotId)?.kind === "PAIR" ? s.pairMinutes : s.sessionMinutes) * 60_000),
    now: new Date(), joinedAt: b.joinedAt, confirmedCame: b.confirmedCame,
  })]));
  return {
    period: { from, to, days: pic.journal.days },
    // Ποια ήταν η συμμετοχή — με διακριτές πηγές.
    participation: {
      sessions: cycle.bookings.map((b) => ({
        date: b.slot.date,
        kind: slotTherapists.get(b.slotId)?.kind === "PAIR" ? "Therapair" : "Ατομική",
        therapist: slotTherapists.get(b.slotId)?.therapist?.name ?? "",
        came: bookingCame(b),
        // Διακριτές έννοιες: επιβεβαιωμένη παρουσία · πάτησε «Μπες» · σημείωμα «Δεν ήρθε» · χωρίς καταγραφή (όχι «απουσία»).
        state: statesBy.get(b.id) ?? "no_record",
        source: PRESENCE_LABEL[statesBy.get(b.id) ?? "no_record"].source,
        hasNote: notes.some((n) => n.slotId === b.slotId),
      })),
      groups: { came: pic.groups.came, passed: pic.groups.passed, noRecord: pic.groups.noRecord, total: pic.groups.total, source: "πραγματικό πρόγραμμα ομάδων· παρουσία = «Μπες στην ομάδα» ή διόρθωση από τη διαχείριση" },
      journal: { written: journal.length, days: pic.journal.days, source: "εγγραφές ημερολογίου ανάκαμψης του μέλους" },
      // Μέρες που δεν ήρθε: «Δεν ήρθε» (σημείωμα) ή χωρίς καταγραφή σε ατομική που πέρασε — χωριστά, όχι «απουσίες».
      missed: cycle.bookings.filter((b) => { const st = statesBy.get(b.id); return st === "absent_confirmed" || st === "no_record"; }).map((b) => ({ date: b.slot.date, state: statesBy.get(b.id) ?? "no_record" })),
      help: { count: pic.help, source: "πατήματα του κόκκινου κουμπιού" },
    },
    // Τι καταγράφηκε ως πρόοδος ή δυσκολία — μόνο μετρήσεις και καταγραφές, χωρίς ερμηνεία.
    recorded: {
      mood: avg(journal.map((j) => j.mood)), craving: avg(journal.map((j) => j.craving)), sleep: avg(journal.map((j) => j.sleepHours)),
      usedDays: journal.filter((j) => j.used).map((j) => j.date),
      // «Μέρες με επιθυμία»: λαχτάρα 6/10 και πάνω στο ημερολόγιο (ίδιο κατώφλι με το «πιο δυνατή λαχτάρα» της ατομικής).
      cravingDays: journal.filter((j) => j.craving >= 6).map((j) => ({ date: j.date, craving: j.craving })),
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
      themes,
      source: "σημειώματα ατομικών/Therapair, στόχοι εβδομάδας, εργασίες, θεματικές της εβδομάδας (φόρμες)",
    },
    // Τι χρειάζεται συνέχεια — τα πεδία συνέχειας του τελευταίου σημειώματος, όπως γράφτηκαν.
    next: {
      from: notes[0] ? { date: notes[0].date, therapist: notes[0].therapist, handover: notes[0].handover } : null,
      source: "το τελευταίο σημείωμα του κύκλου (καρτέλα «Συνέχεια»)",
    },
    // Ανθρώπινη ανασκόπηση (2 γραμμές) — αν υπάρχει.
    review: review ? { goals: dec(review.goals), memberSays: dec(review.memberSays), note: dec(review.note), at: review.createdAt, author: reviewer?.name ?? "" } : null,
    // Προσχέδιο σύνοψης: δεν υπάρχει. Θα γραφεί από άνθρωπο ή (μελλοντικά) θα προταθεί ως προσχέδιο προς έγκριση.
    draft: null as null,
  };
}
