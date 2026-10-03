import { prisma } from "@/lib/db";
import { TOURS, type TourId } from "@/lib/tours";
import { Tour } from "./Tour";

/** Η ξενάγηση μιας σελίδας για τον συγκεκριμένο θεραπευτή (ανοίγει μόνη της αν δεν την έχει δει). */
export async function TourFor({ id, userId }: { id: TourId; userId: string }) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { toursSeen: true } });
  const t = TOURS[id];
  return <Tour id={id} name={t.name} steps={t.steps} auto={!u?.toursSeen.includes(id)} />;
}
