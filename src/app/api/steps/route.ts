import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { encryptBytes } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { notifyMembers } from "@/lib/notify";
import { staffGateOk } from "@/lib/staff-gate";
import { isStepMode, looksLikePdf, needsPdf, STEP_PDF_MAX } from "@/lib/step-modes";
import { STEPS } from "@/lib/steps";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/admin/steps?${q}`, req.url), 303);

// Η διαχείριση στέλνει ένα βήμα (1–12) σε ένα ή περισσότερα μέλη, με έναν από τρεις τρόπους (16/10, src/lib/step-modes.ts).
// Από API (όχι server action): το PDF φτάνει τα 5 MB, ενώ οι server actions δέχονται έως 1 MB.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse(null, { status: 401 });
  if (!(await staffGateOk(user))) return new NextResponse(null, { status: 403 });
  const form = await req.formData();
  const step = Number(form.get("step"));
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const instructions = String(form.get("instructions") ?? "").slice(0, 5000);
  const mode = String(form.get("mode") ?? "FORM");
  const memberIds = form.getAll("member").map(String);
  if (!STEPS.includes(step) || !title || memberIds.length === 0 || !isStepMode(mode)) return back(req, "e=1");
  let pdf: Uint8Array<ArrayBuffer> | null = null, pdfName: string | null = null;
  if (needsPdf(mode)) {
    const file = form.get("pdf");
    if (!(file instanceof File) || file.size === 0) return back(req, "e=pdf");
    if (file.size > STEP_PDF_MAX) return back(req, "e=size");
    const raw = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(file.type, raw.subarray(0, 4))) return back(req, "e=type");
    pdf = new Uint8Array(encryptBytes(Buffer.from(raw)));
    pdfName = file.name.slice(0, 120);
  }
  const members = await prisma.user.findMany({ where: { id: { in: memberIds }, role: "MEMBER", active: true }, select: { id: true } });
  await prisma.assignment.createMany({ data: members.map((m) => ({ memberId: m.id, step, title, instructions, mode, pdf, pdfName, createdById: user.id })) });
  await notifyMembers(members.map((m) => m.id), { title: "Νέα εργασία στη βιβλιοθήκη", url: "/m/library", tag: "assignment" });
  return back(req, `ok=${members.length}`);
}
