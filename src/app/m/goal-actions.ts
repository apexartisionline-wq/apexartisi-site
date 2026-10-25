"use server";

import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { hasConsent, requireProgramMember } from "@/lib/intake";
import { setGoalCheck, weekGoal } from "@/lib/goals";
import { localParts } from "@/lib/time";

// «Σήμερα ήμουν συνεπής με τον στόχο μου;» με ένα πάτημα, πάνω στην κάρτα του στόχου (υπεύθυνη 25/10).
export async function checkGoal(formData: FormData) {
  const user = await requireProgramMember();
  const back = formData.get("back") === "/m/journal" ? "/m/journal" : "/m";
  const check = z.enum(["YES", "PARTLY", "NO"]).safeParse(formData.get("check"));
  const today = localParts(new Date()).date;
  if (check.success && (await hasConsent(user.id, "journal")) && (await weekGoal(user.id, today))) {
    await setGoalCheck(user.id, today, check.data);
  }
  redirect(back, RedirectType.replace);
}
