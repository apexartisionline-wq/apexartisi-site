"use client";

import { useEffect, useState } from "react";

/**
 * Προαιρετικά «λίγα λόγια» που γίνονται το σημείωμα της ατομικής όταν ολοκληρωθεί ένα βήμα του πρωτοκόλλου
 * (1η ατομική: ιστορικό· 2η: πλάνο υποστήριξης). Πρόχειρο στην καρτέλα, ώστε να μη χάνεται με ενδιάμεση αποθήκευση.
 */
export function StepWords({ storageKey, hint }: { storageKey: string; hint: string }) {
  const [v, setV] = useState("");
  useEffect(() => { try { setV(sessionStorage.getItem(storageKey) ?? ""); } catch {} }, [storageKey]);
  return (
    <div className="sec first-words">
      <label className="lab" htmlFor="step-words">Λίγα λόγια για τη σημερινή ατομική <span className="muted small">· προαιρετικό</span></label>
      <textarea
        id="step-words" name="words" rows={3} maxLength={3000} value={v}
        placeholder="π.χ. πώς ήρθε, πώς πήγε η κουβέντα, κάτι που να ξέρει η ομάδα"
        onChange={(e) => { setV(e.target.value); try { sessionStorage.setItem(storageKey, e.target.value); } catch {} }}
      />
      <p className="hint" style={{ margin: "4px 0 0" }}>{hint}</p>
    </div>
  );
}
