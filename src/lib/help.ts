import "server-only";
import type { HelpRequest } from "@prisma/client";
import { prisma } from "./db";
import { helpNeedsEscalation } from "./program";
import { getSettings } from "./settings";
import { sendHelpAlert, telegramConfigured } from "./telegram";

/** Στέλνει (ή ξαναστέλνει) την ειδοποίηση στην ομάδα των θεραπευτών. */
export async function notifyTherapists(req: HelpRequest & { member: { name: string } }): Promise<void> {
  if (!telegramConfigured()) {
    console.error("[help] Το Telegram δεν έχει ρυθμιστεί — η ειδοποίηση ΔΕΝ στάλθηκε", req.id);
    return;
  }
  const messageId = await sendHelpAlert(req.id, req.member.name, req.notifyCount);
  const ids = [...((req.telegramMessageIds as number[]) ?? []), messageId];
  await prisma.helpRequest.update({
    where: { id: req.id },
    data: { telegramMessageIds: ids, notifyCount: { increment: 1 }, lastNotifiedAt: new Date() },
  });
}

/** Ξαναστέλνει όσες ειδοποιήσεις δεν τις ανέλαβε κανείς μέσα στο όριο (10 λεπτά). */
export async function escalatePending(onlyId?: string): Promise<number> {
  const s = await getSettings();
  const now = new Date();
  const open = await prisma.helpRequest.findMany({
    where: { claimedAt: null, resolvedAt: null, ...(onlyId ? { id: onlyId } : {}) },
    include: { member: { select: { name: true } } },
  });
  let sent = 0;
  for (const req of open) {
    if (!helpNeedsEscalation(req, now, s)) continue;
    // Προστασία από διπλή αποστολή όταν τρέχουν ταυτόχρονα cron και σελίδα μέλους.
    const locked = await prisma.helpRequest.updateMany({
      where: { id: req.id, lastNotifiedAt: req.lastNotifiedAt, claimedAt: null },
      data: { lastNotifiedAt: now },
    });
    if (locked.count === 0) continue;
    await notifyTherapists(req);
    sent++;
  }
  return sent;
}
