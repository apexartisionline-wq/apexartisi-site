import "server-only";
import { dec, enc } from "./crypto";
import { prisma } from "./db";

// «Διορθώσεις μόνο ως νέα έκδοση»: πριν αλλάξει ή αφαιρεθεί μια εγγραφή, κρατάμε την προηγούμενη μορφή.
export type HistoryKind = "safety_plan" | "group_note" | "attendance_removed" | "attendance_added" | "intake_check";

export function keepHistory(kind: HistoryKind, x: { memberId?: string | null; ref?: string | null; before: unknown; byId: string }) {
  return prisma.recordHistory.create({ data: { kind, memberId: x.memberId ?? null, ref: x.ref ?? null, before: enc(JSON.stringify(x.before)), byId: x.byId } });
}

export async function historyOf(kind: HistoryKind, where: { memberId?: string; ref?: string }) {
  const rows = await prisma.recordHistory.findMany({ where: { kind, ...where }, orderBy: { createdAt: "desc" } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.byId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ at: r.createdAt, by: names.get(r.byId) ?? "—", before: JSON.parse(dec(r.before)) as unknown }));
}
