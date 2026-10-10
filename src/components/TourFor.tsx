import { prisma } from "@/lib/db";
import { TOURS, type TourId } from "@/lib/tours";
import { Tour } from "./Tour";

/** Η ξενάγηση μιας σελίδας για τον συγκεκριμένο θεραπευτή (ανοίγει μόνη της αν δεν την έχει δει). */
/** `auto={false}`: δεν ανοίγει ποτέ μόνη της (π.χ. «Έκτακτη ανάγκη», που πατιέται σε κρίση). */
export async function TourFor({ id, userId, auto = true }: { id: TourId; userId: string; auto?: boolean }) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { toursSeen: true } });
  const t = TOURS[id];
  return <Tour id={id} name={t.name} steps={t.steps} auto={auto && !u?.toursSeen.includes(id)} />;
}
