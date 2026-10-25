import "server-only";
import { ALERTS, assessmentAlerts, assessmentSchema } from "./assessment";
import { dec } from "./crypto";
import { prisma } from "./db";
import { CRAVING_DAYS, CRAVING_HIGH, safetyFlags } from "./handover-rules";
import { intakeStatus, latestChoices } from "./intake-rules";
import { assessmentDeadline, needsReview, type Trigger } from "./risk";
import { getSettings } from "./settings";
import { formatDate, localParts } from "./time";

/**
 * Σήματα ασφάλειας για ΠΟΛΛΑ μέλη μαζί (15/10). Ίδιοι κανόνες, ίδιο αποτέλεσμα με το παλιό memberSafety ανά μέλος
 * (handover-rules.ts, risk.ts, assessment.ts — καμία αλλαγή κανόνα), αλλά με μία ερώτηση ανά πίνακα για όλα τα μέλη
 * αντί για ~25 ερωτήσεις ανά μέλος. Αιτία: το «Σήμερα» του θεραπευτή (/t) ξεπερνούσε το όριο των 10″ των functions του
 * Netlify (functions στο Οχάιο, βάση στη Φρανκφούρτη: ~100 ms ανά ερώτηση) και η σελίδα έδειχνε «Κάτι δεν φόρτωσε σωστά».
 * Τίποτα δεν γράφεται εδώ — μόνο ανάγνωση.
 */
type Flag = { level: "red" | "yellow"; text: string; at?: Date; key?: string; href?: string; trigText?: string; dueAt?: Date };

const group = <T extends { memberId: string }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const l = m.get(r.memberId);
    if (l) l.push(r);
    else m.set(r.memberId, [r]);
  }
  return m;
};

export async function memberSafetyMany(ids: string[], now = new Date()): Promise<Map<string, Flag[]>> {
  const out = new Map<string, Flag[]>();
  if (ids.length === 0) return out;
  const in_ = { in: ids };
  const since14 = new Date(now.getTime() - 14 * 24 * 3600_000);
  const since30 = new Date(now.getTime() - 30 * 24 * 3600_000);
  const presence = [{ confirmedCame: true }, { confirmedCame: null, joinedAt: { not: null } }];
  const missedWhere = [{ confirmedCame: false }, { confirmedCame: null, joinedAt: null }];
  const noteSel = { createdAt: true, riskChange: true, usedSince: true } as const;

  const [
    members, checks, consents, plans, help, singleNotes, pairNotes, attendance, presentBookings, dropouts, s, missed, lastJournal,
    assessments, teamAlerts, flaggedJournal, lastReview, lastSelfHarm, lastUsed, strongCravings,
  ] = await Promise.all([
    prisma.user.findMany({ where: { id: in_ }, select: { id: true, source: true, programStartDate: true, createdAt: true, alumniSince: true } }),
    prisma.intakeCheck.findMany({ where: { memberId: in_ } }),
    prisma.consent.findMany({ where: { memberId: in_ }, select: { memberId: true, purpose: true, choice: true, recordedAt: true } }),
    prisma.safetyPlan.findMany({ where: { memberId: in_ }, select: { memberId: true, updatedAt: true } }),
    prisma.helpRequest.findMany({ where: { memberId: in_, isDrill: false }, select: { memberId: true, createdAt: true } }),
    // Σημειώματα ατομικής (όχι Therapair) και τα δικά του Therapair — όπως το memberNotes, χωρίς κείμενα.
    prisma.sessionNote.findMany({ where: { slot: { kind: { not: "PAIR" }, bookings: { some: { memberId: in_ } } } }, select: { ...noteSel, slot: { select: { id: true, startsAt: true, bookings: { where: { memberId: in_ }, select: { memberId: true } } } } } }),
    prisma.pairNote.findMany({ where: { memberId: in_ }, select: { ...noteSel, memberId: true, slot: { select: { id: true, startsAt: true } } } }),
    prisma.attendance.groupBy({ by: ["memberId"], where: { memberId: in_ }, _max: { joinedAt: true } }),
    // Τελευταία επαφή από ατομική: παρουσία (επιβεβαίωση «Ήρθε» ή πάτημα «Μπες» χωρίς «Δεν ήρθε»).
    prisma.booking.findMany({ where: { memberId: in_, OR: presence }, select: { memberId: true, joinedAt: true, slot: { select: { startsAt: true } } } }),
    prisma.careTask.groupBy({ by: ["memberId"], where: { memberId: in_, kind: "dropout", doneAt: null }, _count: { _all: true } }),
    getSettings(),
    // Ατομικές χωρίς παρουσία: επιβεβαιωμένη απουσία, ή χωρίς καταγραφή (ούτε πάτημα ούτε επιβεβαίωση).
    prisma.booking.findMany({ where: { memberId: in_, OR: missedWhere, slot: { startsAt: { gte: since14, lt: new Date(now.getTime() - 3600_000) } } }, select: { memberId: true, slotId: true, confirmedCame: true, slot: { select: { startsAt: true } } } }),
    // Η απογραφή μετράει ως επαφή (κανόνας «Χωρίς επαφή»: ομάδα, απογραφή, ατομική).
    prisma.journalEntry.groupBy({ by: ["memberId"], where: { memberId: in_ }, _max: { date: true } }),
    // Η τελευταία μορφή της αρχικής αξιολόγησης κάθε μέλους.
    prisma.assessment.findMany({ where: { memberId: in_ }, orderBy: { createdAt: "desc" }, distinct: ["memberId"], select: { memberId: true, data: true, createdAt: true } }),
    prisma.teamAlert.findMany({ where: { memberId: in_, source: "ASSESSMENT" }, orderBy: { createdAt: "asc" }, select: { memberId: true, kind: true, byId: true, createdAt: true } }),
    // Ό,τι τσέκαρε στο ημερολόγιο ότι «θέλει να ξέρει η ομάδα» (τελευταίες 7 μέρες).
    prisma.journalEntry.findMany({
      where: { memberId: in_, date: { gte: localParts(new Date(now.getTime() - 7 * 86_400_000)).date }, OR: [{ used: true }, { selfHarm: { in: ["YES", "UNSURE"] } }] },
      select: { memberId: true, date: true, used: true, selfHarm: true, updatedAt: true },
      orderBy: { date: "desc" },
    }),
    // Αφορμές για αξιολόγηση αναγκών (riskTrigger): τελευταία αξιολόγηση, σκέψεις και χρήση στο ημερολόγιο.
    prisma.riskReview.groupBy({ by: ["memberId"], where: { memberId: in_ }, _max: { createdAt: true } }),
    prisma.journalEntry.groupBy({ by: ["memberId"], where: { memberId: in_, selfHarm: { in: ["YES", "UNSURE"] } }, _max: { updatedAt: true } }),
    prisma.journalEntry.groupBy({ by: ["memberId"], where: { memberId: in_, used: true }, _max: { updatedAt: true } }),
    // Έντονες επιθυμίες (17/10): λαχτάρα ≥ CRAVING_HIGH τις τελευταίες CRAVING_DAYS μέρες — μόνο αριθμοί, ποτέ το κείμενο.
    prisma.journalEntry.findMany({
      where: { memberId: in_, craving: { gte: CRAVING_HIGH }, date: { gte: localParts(new Date(now.getTime() - CRAVING_DAYS * 86_400_000)).date } },
      select: { memberId: true, date: true, craving: true, updatedAt: true },
    }),
  ]);

  const checksBy = group(checks), consentsBy = group(consents), helpBy = group(help), missedBy = group(missed), alertsBy = group(teamAlerts), journalBy = group(flaggedJournal), presentBy = group(presentBookings), cravingBy = group(strongCravings);
  const planBy = new Map(plans.map((p) => [p.memberId, p.updatedAt]));
  const attBy = new Map(attendance.map((a) => [a.memberId, a._max.joinedAt]));
  const dropBy = new Map(dropouts.map((d) => [d.memberId, d._count._all]));
  const lastJBy = new Map(lastJournal.map((j) => [j.memberId, j._max.date]));
  const reviewBy = new Map(lastReview.map((r) => [r.memberId, r._max.createdAt]));
  const selfHarmBy = new Map(lastSelfHarm.map((r) => [r.memberId, r._max.updatedAt]));
  const usedBy = new Map(lastUsed.map((r) => [r.memberId, r._max.updatedAt]));
  const assessBy = new Map(assessments.map((a) => [a.memberId, a]));
  type Note = { startsAt: Date; createdAt: Date; slotId: string; riskChange: string | null; usedSince: string | null };
  const singleBy = new Map<string, Note[]>(), pairBy = new Map<string, Note[]>();
  for (const n of singleNotes) for (const b of n.slot.bookings) {
    const l = singleBy.get(b.memberId) ?? (singleBy.set(b.memberId, []), singleBy.get(b.memberId)!);
    l.push({ startsAt: n.slot.startsAt, createdAt: n.createdAt, slotId: n.slot.id, riskChange: n.riskChange, usedSince: n.usedSince });
  }
  for (const n of pairNotes) {
    const l = pairBy.get(n.memberId) ?? (pairBy.set(n.memberId, []), pairBy.get(n.memberId)!);
    l.push({ startsAt: n.slot.startsAt, createdAt: n.createdAt, slotId: n.slot.id, riskChange: n.riskChange, usedSince: n.usedSince });
  }
  const desc = (a: Note, b: Note) => b.startsAt.getTime() - a.startsAt.getTime();

  // Σοβαρά σημεία της αρχικής αξιολόγησης (ίδιο με assessmentFlags): τα είδη από την τελευταία μορφή της.
  const kindsBy = new Map<string, { kinds: ReturnType<typeof assessmentAlerts>; at: Date }>();
  for (const [memberId, a] of assessBy) {
    try {
      const data = assessmentSchema.parse(JSON.parse(dec(a.data)));
      kindsBy.set(memberId, { kinds: assessmentAlerts(data, localParts(now).date), at: a.createdAt });
    } catch (e) {
      // Ένα χαλασμένο αρχείο δεν πρέπει να ρίχνει το «Σήμερα» όλων: το καταγράφουμε και συνεχίζουμε.
      console.error("[assessment]", memberId, e);
    }
  }
  const byIds = [...new Set(teamAlerts.map((r) => r.byId))];
  const names = new Map((byIds.length ? await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));

  // Αφορμές (ίδιο με riskTrigger): κόκκινο κουμπί, σκέψεις/χρήση στο ημερολόγιο, υποτροπή/ανησυχία στα 20 τελευταία σημειώματα.
  const trigBy = new Map<string, Trigger>();
  for (const id of ids) {
    const helpAll = helpBy.get(id) ?? [];
    const lastHelp = helpAll.length ? helpAll.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt : null;
    const recent20 = [...[...(singleBy.get(id) ?? [])].sort(desc).slice(0, 20), ...[...(pairBy.get(id) ?? [])].sort(desc).slice(0, 20)].sort(desc).slice(0, 20);
    const flagged = recent20.filter((n) => n.usedSince === "YES" || n.riskChange === "UP").slice(0, 5);
    const sh = selfHarmBy.get(id), us = usedBy.get(id);
    const triggers: Trigger[] = [
      ...(lastHelp ? [{ at: lastHelp, text: "κόκκινο κουμπί" }] : []),
      ...(sh ? [{ at: sh, text: "σκέψεις στο ημερολόγιο" }] : []),
      ...(us ? [{ at: us, text: "χρήση στο ημερολόγιο" }] : []),
      ...flagged.map((n) => ({ at: n.createdAt, text: n.usedSince === "YES" ? "υποτροπή" : "ανησυχία στο σημείωμα" })),
    ];
    const t = needsReview(triggers, reviewBy.get(id) ?? null);
    if (t) trigBy.set(id, t);
  }
  // Επόμενη ατομική με ψυχολόγο μετά την αφορμή (ίδιο με nextClinicalSession) — για την προθεσμία.
  const trigIds = [...trigBy.keys()];
  const minAt = trigIds.length ? new Date(Math.min(...trigIds.map((id) => trigBy.get(id)!.at.getTime()))) : null;
  const clinical = minAt
    ? await prisma.booking.findMany({
        where: { memberId: { in: trigIds }, slot: { startsAt: { gt: minAt }, therapist: { therapistKind: { in: ["CLINICAL", "BOTH"] } } } },
        orderBy: { slot: { startsAt: "asc" } },
        select: { memberId: true, slot: { select: { startsAt: true } } },
      })
    : [];

  const memberById = new Map(members.map((m) => [m.id, m]));
  for (const memberId of ids) {
    const member = memberById.get(memberId);
    if (!member) continue;
    const mChecks = checksBy.get(memberId) ?? [];
    const status = intakeStatus({ source: member.source, done: mChecks.map((c) => c.key), consents: latestChoices(consentsBy.get(memberId) ?? []) });
    const risk = mChecks.find((c) => c.key === "risk");
    const pres = (presentBy.get(memberId) ?? []).reduce<(typeof presentBookings)[number] | null>((a, b) => (!a || b.slot.startsAt > a.slot.startsAt ? b : a), null);
    const lastJ = lastJBy.get(memberId);
    const contacts = [attBy.get(memberId), pres ? pres.joinedAt ?? pres.slot.startsAt : null, lastJ ? new Date(`${lastJ}T20:00:00Z`) : null].filter((d): d is Date => Boolean(d));
    const notes30 = [...(singleBy.get(memberId) ?? []), ...(pairBy.get(memberId) ?? [])].filter((n) => n.startsAt >= since30).sort(desc);
    const flags = safetyFlags({
      now,
      risk: risk ? { value: risk.value, at: risk.doneAt } : null,
      safetyPlanAt: planBy.get(memberId) ?? null,
      helpRequests: (helpBy.get(memberId) ?? []).filter((h) => h.createdAt >= since14).map((h) => ({ createdAt: h.createdAt })),
      notes: notes30.map((n) => ({ at: n.startsAt, riskChange: n.riskChange, usedSince: n.usedSince, slotId: n.slotId })),
      missed: (missedBy.get(memberId) ?? []).map((b) => ({ at: b.slot.startsAt, slotId: b.slotId, noted: b.confirmedCame === false })),
      // Απόφοιτοι (25/10): όχι «μέρες χωρίς επαφή» — οι ομάδες τους είναι ελεύθερες, χωρίς μέτρημα.
      lastContact: member.alumniSince ? null : contacts.length ? new Date(Math.max(...contacts.map((d) => d.getTime()))) : null,
      openDropout: (dropBy.get(memberId) ?? 0) > 0,
      dropoutDays: s.dropoutDays,
      intakeComplete: status.complete,
      cravings: (cravingBy.get(memberId) ?? []).map((c) => ({ date: c.date, craving: c.craving, at: c.updatedAt })),
      programStart: member.programStartDate ? new Date(`${member.programStartDate}T00:00:00Z`) : member.createdAt,
    }).map((f) => (f.key === "craving" || f.key === "new_member" ? { ...f, href: `/t/members/${memberId}` } : f));
    const ak = kindsBy.get(memberId);
    const fromAssessment: Flag[] = (ak?.kinds ?? []).map((k) => {
      const r = (alertsBy.get(memberId) ?? []).find((x) => x.kind === k);
      return { level: (k === "PREGNANCY" ? "yellow" : "red") as "red" | "yellow", key: `assessment_${k}`, text: `${ALERTS[k]} (αρχική αξιολόγηση${r ? ` · ${names.get(r.byId) ?? ""}` : ""})`, at: r?.createdAt ?? ak!.at, href: `/t/members/${memberId}/assessment` };
    });
    // Δύο χωριστές γραμμές (σκέψεις / χρήση): το κόκκινο κουτί 24 ωρών καλύπτει μόνο τις σκέψεις.
    const fromJournal: Flag[] = (journalBy.get(memberId) ?? []).flatMap((j) => [
      ...((j.selfHarm === "YES" || j.selfHarm === "UNSURE") ? [{ level: "red" as const, key: `journal_${j.date}`, text: `Έγραψε στο ημερολόγιο (${formatDate(j.date)}): σκέψεις να κάνει κακό στον εαυτό του`, at: j.updatedAt, href: `/t/members/${memberId}` }] : []),
      ...(j.used ? [{ level: "red" as const, key: `journal_used_${j.date}`, text: `Έγραψε στο ημερολόγιο (${formatDate(j.date)}): έκανε χρήση`, at: j.updatedAt, href: `/t/members/${memberId}` }] : []),
    ]);
    const trig = trigBy.get(memberId);
    let review: Flag[] = [];
    if (trig) {
      const next = clinical.find((b) => b.memberId === memberId && b.slot.startsAt > trig.at);
      const dueAt = assessmentDeadline(trig.at, next?.slot.startsAt ?? null);
      const overdue = dueAt <= now;
      // Προθεσμία (απόφαση 14/10): μέχρι την επόμενη ατομική με ψυχολόγο, το πολύ 7 μέρες· μετά κόκκινο για όλη την ομάδα.
      review = [{
        level: overdue ? "red" : "yellow", key: "risk_review", trigText: trig.text, dueAt,
        text: overdue
          ? `Αξιολόγηση αναγκών ασφάλειας ΕΚΠΡΟΘΕΣΜΗ (μετά από ${trig.text}· προθεσμία ${formatDate(localParts(dueAt).date)})`
          : `Θέλει αξιολόγηση αναγκών ασφάλειας (μετά από ${trig.text}· μέχρι ${formatDate(localParts(dueAt).date)})`,
        at: trig.at, href: `/t/members/${memberId}/risk`,
      }];
    }
    // Τα κόκκινα πρώτα (η εγκυμοσύνη είναι κίτρινη).
    const all: Flag[] = [...fromAssessment, ...fromJournal, ...review, ...(flags as Flag[])];
    out.set(memberId, [...all.filter((f) => f.level === "red"), ...all.filter((f) => f.level !== "red")]);
  }
  return out;
}
