"use server";

import { revalidatePath } from "next/cache";
import { fresh } from "@/lib/fresh-url";
import { redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { canWriteRisk } from "@/lib/risk-db";
import { ADMIN_CARE } from "@/lib/actions-core";
import { athensToUtc } from "@/lib/time";

// Ανάληψη / ολοκλήρωση συγκεκριμένης ενέργειας (13/10).
// Η θεραπευτική ευθύνη παραμένει συλλογική: η ανάληψη αφορά μόνο την ενέργεια. Η διαχείριση μπορεί να αναθέσει.
// Τα σήματα δεν έχουν ανάληψη (διευκρινίσεις 13/10)· η παλιά «signal_followup» δεν αναλαμβάνεται πια.
const KINDS = ["safety_assessment", "initial_assessment", "cycle_review", "step_read"] as const;
// Ενέργειες που ολοκληρώνονται με κουμπί: «Το διάβασα» για βήμα/εργασία που ολοκλήρωσε το μέλος (17/10).
const MANUAL_DONE = new Set<string>(["step_read"]);
// Τα τηλεφωνήματα της διαχείρισης (χωρίς επαφή / ανάγκες ασφάλειας): ανάληψη, αποδέσμευση, ολοκλήρωση μόνο από τη διαχείριση.
const adminCare = (kind: string) => ADMIN_CARE.has(kind);

function back(formData: FormData): string {
  const b = String(formData.get("back") ?? "/t");
  return fresh(/^\/(t|admin)(\/[A-Za-z0-9_\-/?=&]*)?$/.test(b) ? b : "/t");
}


async function resolveClaimer(formData: FormData, user: { id: string; name: string; role: string }) {
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!assigneeId || assigneeId === user.id) return { claimer: user, assignedById: null as string | null };
  if (user.role !== "ADMIN") throw new Error("Μόνο η διαχείριση αναθέτει.");
  const a = await prisma.user.findFirst({ where: { id: assigneeId, active: true, role: { in: ["THERAPIST", "ADMIN"] } }, select: { id: true, name: true, role: true, therapistKind: true } });
  if (!a) throw new Error("Άγνωστος θεραπευτής.");
  return { claimer: a, assignedById: user.id };
}

export async function claimAction(formData: FormData): Promise<void> {
  const user = await requireRole("THERAPIST", "ADMIN");
  const source = String(formData.get("source") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const dueAt = user.role === "ADMIN" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? athensToUtc(dueDate, 23, 59) : null;
  const { claimer, assignedById } = await resolveClaimer(formData, user);
  const full = await prisma.user.findUniqueOrThrow({ where: { id: claimer.id }, select: { id: true, name: true, role: true, therapistKind: true } });

  if (source === "care") {
    const id = String(formData.get("ref") ?? "");
    const t = await prisma.careTask.findUnique({ where: { id } });
    if (!t || t.doneAt) redirect(back(formData));
    if (adminCare(t.kind) && (user.role !== "ADMIN" || full.role !== "ADMIN")) throw new Error("Το τηλεφώνημα το αναλαμβάνει η διαχείριση.");
    // Ρητή ανάθεση από τη διαχείριση αλλάζει και ήδη αναληφθείσα ενέργεια.
    if (assignedById && t.claimedAt) await prisma.careTask.update({ where: { id }, data: { claimedById: full.id, claimedByName: full.name, claimedAt: new Date() } });
    else if (!t.claimedAt) await prisma.careTask.update({ where: { id }, data: { claimedById: full.id, claimedByName: full.name, claimedAt: new Date() } });
    await logAccess(user.id, t.memberId, "action_claim:care");
  } else {
    const memberId = String(formData.get("memberId") ?? "");
    const kind = String(formData.get("kind") ?? "");
    const ref = String(formData.get("ref") ?? "").slice(0, 120);
    if (!(KINDS as readonly string[]).includes(kind) || !ref) throw new Error("Άγνωστη ενέργεια.");
    const m = await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } });
    if (!m) throw new Error("Άγνωστο μέλος.");
    // Αξιολόγηση αναγκών ασφάλειας / αρχική αξιολόγηση: μόνο ψυχολόγος (ίδιος κανόνας με το γράψιμο της αξιολόγησης).
    if ((kind === "safety_assessment" || kind === "initial_assessment") && !canWriteRisk(full)) throw new Error("Την αναλαμβάνει ψυχολόγος.");
    const existing = await prisma.actionItem.findUnique({ where: { memberId_ref: { memberId, ref } } });
    if (existing?.doneAt) redirect(back(formData));
    const data = { claimedById: full.id, claimedByName: full.name, claimedAt: new Date(), assignedById, ...(dueAt ? { dueAt } : {}) };
    if (existing) {
      // Αν την έχει ήδη αναλάβει κάποιος, αλλάζει μόνο με ρητή ανάθεση από τη διαχείριση.
      if (!existing.claimedAt || assignedById) await prisma.actionItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.actionItem.create({ data: { memberId, kind, ref, ...data } });
    }
    await logAccess(user.id, memberId, `action_claim:${kind}`);
  }
  revalidatePath("/t");
  redirect(back(formData));
}

export async function releaseAction(formData: FormData): Promise<void> {
  const user = await requireRole("THERAPIST", "ADMIN");
  const source = String(formData.get("source") ?? "");
  if (source === "care") {
    const id = String(formData.get("ref") ?? "");
    const t = await prisma.careTask.findUnique({ where: { id } });
    if (t && !t.doneAt && (adminCare(t.kind) ? user.role === "ADMIN" : t.claimedById === user.id || user.role === "ADMIN")) {
      await prisma.careTask.update({ where: { id }, data: { claimedById: null, claimedByName: null, claimedAt: null } });
      await logAccess(user.id, t.memberId, "action_release:care");
    }
  } else {
    const memberId = String(formData.get("memberId") ?? "");
    const ref = String(formData.get("ref") ?? "");
    const row = await prisma.actionItem.findUnique({ where: { memberId_ref: { memberId, ref } } });
    if (row && !row.doneAt && (row.claimedById === user.id || user.role === "ADMIN")) {
      await prisma.actionItem.update({ where: { id: row.id }, data: { claimedById: null, claimedByName: null, claimedAt: null, assignedById: null } });
      await logAccess(user.id, memberId, `action_release:${row.kind}`);
    }
  }
  revalidatePath("/t");
  redirect(back(formData));
}

export async function completeAction(formData: FormData): Promise<void> {
  const user = await requireRole("THERAPIST", "ADMIN");
  const source = String(formData.get("source") ?? "");
  const note = enc(String(formData.get("note") ?? "").trim().slice(0, 500));
  if (source === "care") {
    const id = String(formData.get("ref") ?? "");
    const t = await prisma.careTask.findUnique({ where: { id } });
    if (t && !t.doneAt) {
      if (adminCare(t.kind) && user.role !== "ADMIN") throw new Error("Το τηλεφώνημα το ολοκληρώνει η διαχείριση.");
      await prisma.careTask.update({ where: { id }, data: { doneAt: new Date(), doneById: user.id, note, ...(t.claimedAt ? {} : { claimedById: user.id, claimedByName: user.name, claimedAt: new Date() }) } });
      await logAccess(user.id, t.memberId, "action_done:care");
    }
  } else {
    const memberId = String(formData.get("memberId") ?? "");
    const kind = String(formData.get("kind") ?? "");
    const ref = String(formData.get("ref") ?? "").slice(0, 120);
    // Οι υπόλοιπες ολοκληρώνονται από τη δουλειά που γίνεται (νέα αξιολόγηση, γραμμένη ανασκόπηση), όχι με κουμπί.
    if (!MANUAL_DONE.has(kind) || !ref) throw new Error("Αυτή η ενέργεια ολοκληρώνεται από τη δουλειά που γίνεται.");
    const m = await prisma.user.findFirst({ where: { id: memberId, role: "MEMBER" }, select: { id: true } });
    if (!m) throw new Error("Άγνωστο μέλος.");
    const now = new Date();
    const row = await prisma.actionItem.findUnique({ where: { memberId_ref: { memberId, ref } } });
    if (row?.doneAt) redirect(back(formData));
    const done = { doneAt: now, doneById: user.id, doneByName: user.name, doneNote: note };
    if (row) await prisma.actionItem.update({ where: { id: row.id }, data: { ...done, ...(row.claimedAt ? {} : { claimedById: user.id, claimedByName: user.name, claimedAt: now }) } });
    else await prisma.actionItem.create({ data: { memberId, kind, ref, claimedById: user.id, claimedByName: user.name, claimedAt: now, ...done } });
    await logAccess(user.id, memberId, `action_done:${kind}`);
  }
  revalidatePath("/t");
  redirect(back(formData));
}
