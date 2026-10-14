"use client";

import { useFormStatus } from "react-dom";

// «Ξεκίνα δοκιμαστική ατομική τώρα» (14/10): δείχνει ότι δουλεύει όσο φτιάχνεται η ατομική, και δεν ξαναπατιέται στο μεταξύ.
export function DemoStartButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sm" disabled={pending} aria-busy={pending} title="Φτιάχνει μια ατομική σε 2 λεπτά με ψεύτικο μέλος, για να δεις πώς συνδέεσαι και τι βλέπεις μέσα στην ατομική">
      {pending ? "Φτιάχνεται η δοκιμαστική ατομική…" : "Ξεκίνα δοκιμαστική ατομική τώρα"}
    </button>
  );
}
