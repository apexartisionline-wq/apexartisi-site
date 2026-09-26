import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Παλιοί σύνδεσμοι ανά κράτηση → σελίδα της θέσης.
export default async function BookingRedirect({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const b = await prisma.booking.findUnique({ where: { id }, select: { slotId: true } });
  if (!b) notFound();
  redirect(`/t/s/${b.slotId}`);
}
