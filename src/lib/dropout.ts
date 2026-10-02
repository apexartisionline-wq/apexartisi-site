import "server-only";
import { prisma } from "./db";
import { notifyRole } from "./notify";
import { dropoutSince, isDropout } from "./program";
import { localParts } from "./time";
import type { Settings } from "./settings";
import { getSettings } from "./settings";

/** Δημιουργεί εκκρεμότητα «dropout» για κάθε ενεργό μέλος χωρίς ομάδα, ημερολόγιο ή κράτηση για `dropoutDays` μέρες. */
export async function checkDropouts(now = new Date(), settings?: Settings): Promise<number> {
  const s = settings ?? (await getSettings());
  const since = dropoutSince(now, s.dropoutDays);
  const today = localParts(now).date;
  const members = await prisma.user.findMany({
    where: { role: "MEMBER", active: true, programStartDate: { not: null } },
    select: {
      id: true,
      programStartDate: true,
      attendances: { orderBy: { joinedAt: "desc" }, take: 1, select: { joinedAt: true } },
      journal: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      bookings: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, joinedAt: true } },
    },
  });
  const tasks = await prisma.careTask.findMany({
    where: { kind: "dropout", memberId: { in: members.map((m) => m.id) }, OR: [{ doneAt: null }, { doneAt: { gte: since } }] },
    select: { memberId: true, doneAt: true },
  });
  let created = 0;
  for (const m of members) {
    const contacts = [
      m.attendances[0]?.joinedAt,
      m.journal[0]?.updatedAt,
      m.bookings[0]?.createdAt,
      m.bookings[0]?.joinedAt ?? undefined,
    ].filter((d): d is Date => Boolean(d));
    const lastContact = contacts.length ? new Date(Math.max(...contacts.map((d) => d.getTime()))) : null;
    const mine = tasks.filter((t) => t.memberId === m.id);
    if (
      isDropout({
        programStartDate: m.programStartDate,
        today,
        days: s.dropoutDays,
        lastContact,
        since,
        openTask: mine.some((t) => !t.doneAt),
        recentTask: mine.some((t) => t.doneAt),
      })
    ) {
      await prisma.careTask.create({ data: { memberId: m.id, kind: "dropout", dueAt: now } });
      created++;
    }
  }
  if (created > 0) await notifyRole("THERAPIST", { title: "Μέλος χωρίς επαφή — τηλεφώνημα", url: "/t", tag: "care" });
  return created;
}
