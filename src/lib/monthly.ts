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
  const text = draftMessage(member.name.split(" ")[0], pic);
  const row = await prisma.monthlyMessage.create({ data: { memberId: member.id, cycleId: cycle.id, text: enc(text) } });
  return { ...row, text, cycle };
}
