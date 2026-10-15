"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "./Icon";

// «‹ Πίσω» πάνω αριστερά σε κάθε σελίδα (υπεύθυνη 16/10: «κουμπί να πηγαίνει πίσω το κάθε βήμα», όπως στο iPhone).
// Πηγαίνει στην προηγούμενη σελίδα της εφαρμογής. Αν δεν υπάρχει προηγούμενη μέσα στην εφαρμογή (π.χ. η σελίδα άνοιξε
// από ειδοποίηση ή σύνδεσμο), πηγαίνει στο «Σήμερα» του ρόλου — ποτέ έξω από την εφαρμογή. Δεν φαίνεται στο ίδιο το
// «Σήμερα», ούτε όπου η σελίδα έχει ήδη δικό της «‹ …» (CSS, .backbar:has).
let moves = 0; // πόσα βήματα μέσα στην εφαρμογή μπορούμε να γυρίσουμε
let last: string | null = null;
let goingBack = false;

export function BackButton({ home }: { home: string }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (last !== null && last !== path) {
      if (goingBack) goingBack = false;
      else moves++;
    }
    last = path;
  }, [path]);
  if (path === home) return null;
  const go = () => {
    if (moves > 0 && window.history.length > 1) {
      moves--;
      goingBack = true;
      router.back();
    } else {
      router.push(home);
    }
  };
  return (
    <div className="backbar">
      <button type="button" className="back-link" onClick={go}>
        <Icon name="back" size={20} /> Πίσω
      </button>
    </div>
  );
}
