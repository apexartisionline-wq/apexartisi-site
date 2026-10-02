import "server-only";
import { prisma } from "./db";
import { notifyRole } from "./notify";
import { dropoutSince, isDropout } from "./program";
import { localParts } from "./time";
import type { Settings } from "./settings";
import { getSettings } from "./settings";

/** Δημιουργεί εκκρεμότητα «dropout» (για τη διαχείριση) για κάθε ενεργό μέλος χωρίς ομάδα, απογραφή ή ατομική για `dropoutDays` μέρες. */
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
      bookings: { where: { joinedAt: { not: null } }, orderBy: { joinedAt: "desc" }, take: 1, select: { joinedAt: true } },
    },
  });
  const tasks = await prisma.careTask.findMany({
    where: { kind: "dropout", memberId: { in: members.map((m) => m.id) }, OR: [{ doneAt: null }, { doneAt: { gte: since } }] },
    select: { memberId: true, doneAt: true },
  });
  let created = 0;
  for (const m of members) {
    // Επαφή = μπήκε σε ομάδα, έγραψε απογραφή ή μπήκε σε ατομική (απόφαση υπεύθυνης).
    const contacts = [
      m.attendances[0]?.joinedAt,
      m.journal[0]?.updatedAt,
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
  // Τηλεφωνεί η διαχείριση (οι θεραπευτές δεν βλέπουν τηλέφωνα μελών).
  if (created > 0) await notifyRole("ADMIN", { title: "Μέλος χωρίς επαφή 3 μέρες — τηλεφώνημα", url: "/admin", tag: "care" });
  return created;
}
