import "server-only";
import { memberSafetyMany } from "./safety-batch";
import { z } from "zod";
import { dec, enc } from "./crypto";
import { prisma } from "./db";
import { CASE_FIELDS, type CaseData } from "./handover-rules";
import { formatDate, localParts } from "./time";

/**
 * Σήματα ασφάλειας ενός μέλους (βλ. handover-rules.ts). Από το ημερολόγιο παίρνει μόνο τα σημάδια και τις ημερομηνίες — όχι κείμενα.
 * Από 15/10 μία κοινή υλοποίηση για ένα ή πολλά μέλη (safety-batch.ts): ίδιοι κανόνες, λίγες ερωτήσεις.
 */
export async function memberSafety(memberId: string, now = new Date()) {
  return (await memberSafetyMany([memberId], now)).get(memberId) ?? [];
}

export type CaseVersion = { id: string; data: CaseData; author: string; at: Date };

export async function caseHistory(memberId: string, take = 20): Promise<CaseVersion[]> {
  const rows = await prisma.caseSummary.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take });
  const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, name: true } });
  return rows.map((r) => ({
    id: r.id,
    data: JSON.parse(dec(r.content)) as CaseData,
    author: authors.find((a) => a.id === r.authorId)?.name ?? "—",
    at: r.createdAt,
  }));
}

export async function saveCase(memberId: string, formData: FormData, authorId: string): Promise<void> {
  const data: CaseData = {};
  for (const f of CASE_FIELDS) data[f.key] = z.string().max(3000).parse(String(formData.get(f.key) ?? "")).trim();
  await prisma.caseSummary.create({ data: { memberId, authorId, content: enc(JSON.stringify(data)) } });
}
