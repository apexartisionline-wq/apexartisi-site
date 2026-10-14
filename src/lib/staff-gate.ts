import "server-only";
import { ndaStatus } from "./nda";
import { getSettings } from "./settings";

/**
 * Ίδιοι κανόνες με τα layouts θεραπευτή/διαχείρισης, για τα API που δίνουν δεδομένα μέλους σε προσωπικό (14/10):
 * αν απαιτείται δεύτερος κωδικός (2FA) και δεν έχει στηθεί, ή αν εκκρεμεί η αποδοχή του εντύπου εχεμύθειας,
 * τα δεδομένα δεν σερβίρονται — όπως δεν ανοίγουν και οι σελίδες.
 */
export async function staffGateOk(user: { id: string; role: string; totpEnabled: boolean; ndaExempt?: boolean }): Promise<boolean> {
  if (user.role === "MEMBER") return true;
  const s = await getSettings();
  if (s.requireStaff2FA && !user.totpEnabled) return false;
  const st = await ndaStatus(user);
  if (st.needsAccept) return false;
  if (st.needsFile && s.ndaRequireFile) return false;
  return true;
}
