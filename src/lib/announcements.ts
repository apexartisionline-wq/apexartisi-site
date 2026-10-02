import "server-only";
import type { Audience, Role } from "@prisma/client";
import { prisma } from "./db";

export function audiencesFor(role: Role): Audience[] {
  return role === "MEMBER" ? ["MEMBERS", "ALL"] : ["STAFF", "ALL"];
}

/** Ενεργές ανακοινώσεις που ο χρήστης δεν έχει ακόμα κλείσει με «Εντάξει». */
export function pendingAnnouncements(user: { id: string; role: Role }) {
  return prisma.announcement.findMany({
    where: {
      audience: { in: audiencesFor(user.role) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      acks: { none: { userId: user.id } },
      createdById: { not: user.id },
    },
    orderBy: { createdAt: "desc" },
  });
}
