import "server-only";
import { dec, enc } from "./crypto";
import { cyclePicture, lastFinishedCycle } from "./cycle-review";
import { prisma } from "./db";
import { draftMessage } from "./monthly-message";

/** Το μήνυμα του τελευταίου ολοκληρωμένου κύκλου· αν δεν υπάρχει, φτιάχνεται σχέδιο από τα νούμερα. */
export async function messageForMember(member: { id: string; name: string }) {
  const cycle = await lastFinishedCycle(member.id);
  if (!cycle) return null;
  const existing = await prisma.monthlyMessage.findUnique({ where: { cycleId: cycle.id } });
  if (existing) return { ...existing, text: dec(existing.text), cycle };
  const pic = await cyclePicture(member.id, cycle);
  // Οι θεματικές των εβδομάδων του μήνα, από τις φόρμες που ανεβάζει η διαχείριση («Πίστη: …» → «Πίστη»).
  const forms = await prisma.content.findMany({ where: { kind: "FORM", date: { gte: pic.from, lte: pic.to } }, orderBy: { date: "asc" }, select: { title: true } });
  const themes = [...new Set(forms.map((f) => f.title.split(":")[0].trim()).filter(Boolean))];
  const month = (await prisma.cycle.count({ where: { memberId: member.id, startedAt: { lte: cycle.startedAt } } })) || undefined;
  const text = draftMessage(member.name.split(" ")[0], { ...pic, themes }, month);
  const row = await prisma.monthlyMessage.create({ data: { memberId: member.id, cycleId: cycle.id, text: enc(text) } });
  return { ...row, text, cycle };
}
