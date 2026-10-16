import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { decryptBytes } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { staffGateOk } from "@/lib/staff-gate";
import { safeFileName } from "@/lib/step-modes";

// Το PDF ενός βήματος (?f=task, της διαχείρισης) ή το συμπληρωμένο PDF του μέλους (?f=answer).
// Το βλέπει το ίδιο το μέλος και το προσωπικό (2FA/εχεμύθεια όπως στις σελίδες, με καταγραφή πρόσβασης). Ποτέ cache.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const which = new URL(req.url).searchParams.get("f") === "answer" ? "answer" : "task";
  const a = await prisma.assignment.findUnique({ where: { id }, select: { memberId: true, pdf: which === "task", pdfName: true, answerPdf: which === "answer", answerPdfName: true, title: true } });
  if (!a) return new NextResponse(null, { status: 404 });
  if (user.role === "MEMBER" && user.id !== a.memberId) return new NextResponse(null, { status: 404 });
  if (!(await staffGateOk(user))) return new NextResponse(null, { status: 403 });
  const bytes = which === "task" ? a.pdf : a.answerPdf;
  if (!bytes) return new NextResponse(null, { status: 404 });
  if (user.role !== "MEMBER") await logAccess(user.id, a.memberId, which === "task" ? "step_pdf_view" : "step_answer_pdf_view");
  const name = safeFileName((which === "task" ? a.pdfName : a.answerPdfName) ?? "", which === "task" ? "vima.pdf" : "apantisi.pdf");
  return new NextResponse(new Uint8Array(decryptBytes(Buffer.from(bytes))), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "private, no-store" },
  });
}
