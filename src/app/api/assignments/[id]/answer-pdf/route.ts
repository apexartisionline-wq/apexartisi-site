import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { encryptBytes } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notify";
import { looksLikePdf, STEP_PDF_MAX } from "@/lib/step-modes";

// Το μέλος ανεβάζει το συμπληρωμένο PDF του βήματος (τρόπος PDF_FILL). Κρυπτογραφημένο· μια νέα αποστολή αντικαθιστά την
// προηγούμενη (όπως η απάντηση με κείμενο, που επίσης ξαναγράφεται από το μέλος).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/m/library/a/${id}?${q}`, req.url), 303);
  const a = await prisma.assignment.findFirst({ where: { id, memberId: user.id }, select: { id: true, mode: true, answeredAt: true, createdById: true } });
  if (!a || a.mode !== "PDF_FILL") return new NextResponse(null, { status: 404 });
  const file = (await req.formData()).get("pdf");
  if (!(file instanceof File) || file.size === 0) return back("e=pdf");
  if (file.size > STEP_PDF_MAX) return back("e=size");
  const raw = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(file.type, raw.subarray(0, 4))) return back("e=pdftype");
  const now = new Date();
  await prisma.assignment.update({ where: { id }, data: { answerPdf: new Uint8Array(encryptBytes(Buffer.from(raw))), answerPdfName: file.name.slice(0, 120), answerPdfAt: now, answeredAt: now } });
  if (!a.answeredAt) await notifyUsers([a.createdById], { title: "Απάντηση σε εργασία", url: `/t/members/${user.id}/assignments`, tag: "assignment" });
  return back("ok=pdf");
}
