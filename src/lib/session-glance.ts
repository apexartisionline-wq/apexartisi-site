import "server-only";
import { dec } from "./crypto";
import { prisma } from "./db";
import { memberNotes } from "./member-notes";
import { bothPictures } from "./picture-db";
import { addDays, localParts } from "./time";

/** Όσα χρειάζεται ο θεραπευτής «με μια ματιά» πριν/κατά την ατομική. */
export async function sessionGlance(memberId: string, beforeSlot: { id: string; startsAt: Date }) {
  const now = new Date();
  const today = localParts(now).date;
  const [pictures, help14, prev, assignment, forms, dailyText] = await Promise.all([
    // Εβδομάδα (τελευταίες 7 ημέρες) και Μήνας (ο τρέχων κύκλος) — η ίδια λογική με φάκελο και «Συνέπεια» (14/10).
    bothPictures(memberId, now),
    prisma.helpRequest.count({ where: { memberId, isDrill: false, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } }),
    // Το προηγούμενο σημείωμα (άλλης συνεδρίας) για «ανοιχτό από την προηγούμενη φορά».
    memberNotes(memberId, { before: beforeSlot.startsAt, excludeSlot: beforeSlot.id, take: 1 }).then((ns) => ns[0] ?? null),
    prisma.assignment.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, answer: true, answeredAt: true } }),
    // Φόρμες της θεματικής αυτής της εβδομάδας (Δευτέρα–Κυριακή).
    prisma.content.findMany({ where: { kind: "FORM", date: { gte: mondayOf(today), lte: addDays(mondayOf(today), 6) } }, orderBy: { date: "asc" }, select: { id: true, title: true, date: true, body: true, url: true } }),
    // Το κείμενο της ημέρας, για να ξέρει ο θεραπευτής τι διάβασε σήμερα το μέλος.
    prisma.content.findFirst({ where: { kind: "DAILY_TEXT", date: today }, select: { id: true, title: true, date: true, body: true, url: true } }),
  ]);

  return {
    pictures,
    help14,
    prev: prev
      ? { by: prev.therapist, byKind: prev.therapistKind, date: prev.date, next: prev.next, slotId: prev.slotId, text: prev.text, pair: prev.pair, handover: prev.handover, safety: prev.safety, usedSince: prev.usedSince }
      : null,
    assignment: assignment ? { id: assignment.id, title: assignment.title, answered: Boolean(assignment.answeredAt), length: dec(assignment.answer).length } : null,
    forms: forms.map((f, i) => `Φόρμα ${i + 1} · ${f.title}`).slice(0, 3),
    // Οι ίδιες φόρμες με σύνδεσμο, για να τις ανοίξει ο θεραπευτής («Υλικό»).
    theme: { forms: forms.slice(0, 3), dailyText },
    // Τα ίδια, ανοιχτά μέσα στο σημειωματάριο (δίπλα στο «Τι έφερε»), για να τα διαβάζει χωρίς να φύγει.
    themeDetails: [
      ...forms.slice(0, 3).map((f, i) => ({ id: f.id, label: `Φόρμα ${i + 1}`, title: f.title, body: f.body, url: f.url })),
      ...(dailyText ? [{ id: dailyText.id, label: "Κείμενο της ημέρας", title: dailyText.title, body: dailyText.body, url: dailyText.url }] : []),
    ],
  };
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // Δευτέρα = 0
  return addDays(date, -wd);
}
