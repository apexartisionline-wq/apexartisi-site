"use client";

import { useFormStatus } from "react-dom";

// «Ξεκίνα δοκιμαστική ατομική τώρα» (14/10): δείχνει ότι δουλεύει όσο φτιάχνεται η ατομική, και δεν ξαναπατιέται στο μεταξύ.
export function DemoStartButton({ first = false }: { first?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={first ? "sm outline" : "sm"} disabled={pending} aria-busy={pending} title={first ? "Φτιάχνει νέο ψεύτικο μέλος χωρίς ιστορικό και την 1η του ατομική σε 2 λεπτά (με αρχική αξιολόγηση)" : "Φτιάχνει μια ατομική σε 2 λεπτά με ψεύτικο μέλος, για να δεις πώς συνδέεσαι και τι βλέπεις μέσα στην ατομική"}>
      {pending ? "Φτιάχνεται η δοκιμαστική ατομική…" : first ? "Δοκιμαστική 1η ατομική (νέο μέλος)" : "Ξεκίνα δοκιμαστική ατομική τώρα"}
    </button>
  );
}
