import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Κάθε άνοιγμα του κόκκινου κουμπιού καταγράφεται (το βλέπει η επόμενη συνεδρία).
export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== "MEMBER") return new NextResponse(null, { status: 401 });
  await prisma.helpOpen.create({ data: { memberId: user.id } });
  return NextResponse.json({ ok: true });
}
