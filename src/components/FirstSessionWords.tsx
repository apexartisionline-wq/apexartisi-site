"use client";

import { useEffect, useState } from "react";

/**
 * 1η ατομική (υπεύθυνη 16/10: «ιστορικό και λίγα λόγια από κάτω αν θέλει, σε ένα πλαίσιο»): προαιρετικό κείμενο που
 * γίνεται το σημείωμα της ατομικής όταν ολοκληρωθεί η αρχική αξιολόγηση. Κρατιέται ως πρόχειρο στην καρτέλα,
 * ώστε να μη χάνεται με την ενδιάμεση «Αποθήκευση» της αξιολόγησης.
 */
export function FirstSessionWords({ slotId }: { slotId: string }) {
  const key = `first-words:${slotId}`;
  const [v, setV] = useState("");
  useEffect(() => { try { setV(sessionStorage.getItem(key) ?? ""); } catch {} }, [key]);
  return (
    <div className="sec first-words">
      <label className="lab" htmlFor="first-words">Λίγα λόγια για τη σημερινή ατομική <span className="muted small">· προαιρετικό</span></label>
      <textarea
        id="first-words" name="words" rows={3} maxLength={3000} value={v}
        placeholder="π.χ. πώς ήρθε, πώς ένιωσε στην πρώτη κουβέντα, κάτι που να ξέρει η ομάδα"
        onChange={(e) => { setV(e.target.value); try { sessionStorage.setItem(key, e.target.value); } catch {} }}
      />
      <p className="hint" style={{ margin: "4px 0 0" }}>Γίνεται το σημείωμα της ατομικής μόλις πατήσεις «Ολοκλήρωση». Ό,τι αφορά την ασφάλεια γράφεται στις ερωτήσεις του ιστορικού.</p>
    </div>
  );
}
