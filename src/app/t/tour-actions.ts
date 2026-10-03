"use server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TOURS, type TourId } from "@/lib/tours";

/** Η ξενάγηση μιας σελίδας δεν ανοίγει ξανά μόνη της για αυτόν τον θεραπευτή (σε όποια συσκευή). */
export async function markTourSeen(id: string): Promise<void> {
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!(id in TOURS)) return;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { toursSeen: true } });
  if (u && !u.toursSeen.includes(id as TourId)) await prisma.user.update({ where: { id: user.id }, data: { toursSeen: { push: id } } });
}
