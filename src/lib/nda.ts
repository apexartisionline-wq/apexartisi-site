import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSettings } from "./settings";

/**
 * Έντυπο εχεμύθειας (έγγραφο 16 του δικηγόρου — απόφαση υπεύθυνης 14/10).
 *  - Ποιος υπογράφει: κάθε λογαριασμός προσωπικού (θεραπευτές και τυχόν αναπληρωτής της διαχείρισης) ΕΚΤΟΣ από
 *    όποιον έχει εξαιρεθεί ρητά (`User.ndaExempt`, η υπεύθυνη) και από όποιον ανέβασε την ισχύουσα έκδοση.
 *  - Κύριο αποδεικτικό: το υπογεγραμμένο αρχείο (gov.gr ή σάρωση, ή πρωτότυπο σε χαρτί που σημειώνει η διαχείριση).
 *    Συμπληρωματική καταγραφή: η ψηφιακή αποδοχή μέσα στην εφαρμογή («διάβασα και αποδέχομαι την έκδοση Χ», όνομα,
 *    ώρα, λογαριασμός, IP). Η πρόσβαση ανοίγει με την αποδοχή· το αρχείο μένει «εκκρεμεί» μέχρι να ανέβει —
 *    εκτός αν η ρύθμιση `ndaRequireFile` ζητά και το αρχείο (αυστηρό).
 *  - Νέα έκδοση του εντύπου = όλοι αποδέχονται ξανά. Τίποτα δεν σβήνεται.
 *  - Χωρίς ανεβασμένο έντυπο η εφαρμογή δεν ζητά τίποτα (η δοκιμή δουλεύει όπως πριν).
 */
export const NDA_MAX_BYTES = 10 * 1024 * 1024;
export const NDA_MIMES = ["application/pdf", "image/jpeg", "image/png"];
export const SIGNED_HOW: Record<string, string> = { GOV: "ψηφιακή υπογραφή gov.gr", SCAN: "σάρωση υπογεγραμμένου", PAPER: "πρωτότυπο σε χαρτί στο γραφείο" };

export type StaffLike = { id: string; role: string; ndaExempt?: boolean };

/** Η ισχύουσα (τελευταία) έκδοση του εντύπου, χωρίς τα bytes. */
export async function activeNda() {
  return prisma.staffDocument.findFirst({ where: { kind: "NDA" }, orderBy: { version: "desc" }, omit: { file: true } });
}

export function isNdaExempt(user: StaffLike, doc: { uploadedById: string } | null): boolean {
  if (user.role === "MEMBER") return true;
  if (user.ndaExempt) return true;
  return Boolean(doc && doc.uploadedById === user.id);
}

/** Κατάσταση ενός λογαριασμού προσωπικού ως προς την ισχύουσα έκδοση. */
export async function ndaStatus(user: StaffLike) {
  const doc = await activeNda();
  const exempt = isNdaExempt(user, doc);
  const consent = doc ? await prisma.staffConsent.findUnique({ where: { userId_documentId: { userId: user.id, documentId: doc.id } }, omit: { signedFile: true } }) : null;
  const signed = Boolean(consent?.signedAt);
  return { doc, exempt, consent, accepted: Boolean(consent), signed, needsAccept: Boolean(doc) && !exempt && !consent, needsFile: Boolean(doc) && !exempt && Boolean(consent) && !signed };
}

/** Πύλη των σελίδων προσωπικού: χωρίς αποδοχή της ισχύουσας έκδοσης, μόνο η σελίδα του εντύπου (και ο λογαριασμός). */
export async function requireNda(user: StaffLike): Promise<void> {
  if (user.role === "MEMBER") return;
  const st = await ndaStatus(user);
  if (st.needsAccept) redirect("/nda");
  if (st.needsFile && (await getSettings()).ndaRequireFile) redirect("/nda?file=1");
}

/** Κατάσταση όλων των λογαριασμών προσωπικού για τη διαχείριση. */
export async function ndaOverview() {
  const doc = await activeNda();
  const staff = await prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] } }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }], select: { id: true, name: true, username: true, role: true, active: true, ndaExempt: true } });
  const consents = doc ? await prisma.staffConsent.findMany({ where: { documentId: doc.id }, omit: { signedFile: true } }) : [];
  const byUser = new Map(consents.map((c) => [c.userId, c]));
  return {
    doc,
    rows: staff.map((u) => {
      const c = byUser.get(u.id) ?? null;
      const exempt = isNdaExempt(u, doc);
      const state: "exempt" | "none" | "accepted" | "signed" = exempt ? "exempt" : !c ? "none" : c.signedAt ? "signed" : "accepted";
      return { user: u, consent: c, exempt, state };
    }),
  };
}

export const NDA_STATE: Record<"exempt" | "none" | "accepted" | "signed", { text: string; tone: "" | "grey" | "yellow" | "ok" }> = {
  exempt: { text: "Εξαιρείται", tone: "grey" },
  none: { text: "Δεν έχει αποδεχθεί", tone: "yellow" },
  accepted: { text: "Αποδοχή · εκκρεμεί υπογεγραμμένο αρχείο", tone: "yellow" },
  signed: { text: "Αποδοχή και υπογεγραμμένο αρχείο", tone: "ok" },
};
