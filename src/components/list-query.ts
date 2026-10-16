"use client";

import { useEffect, useState } from "react";

// Κοινή αναζήτηση + φίλτρο για τις λίστες ανθρώπων («Μέλη» του θεραπευτή, «Άνθρωποι» της διαχείρισης — 16/10, ίδιο
// περιβάλλον σε όλους τους ρόλους). Μένουν στη διεύθυνση (?q=&f=), ώστε το «‹ Πίσω» να γυρίζει στην ίδια εικόνα.

/** Σύγκριση χωρίς τόνους και πεζά/κεφαλαία (ίδια λογική με τον «Οδηγό ομάδας»). */
export const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ").trim();

export function useListQuery<K extends string>(keys: readonly K[], initialQ: string, initialF: string, all: K) {
  const valid = (x: string | null): x is K => x !== null && (keys as readonly string[]).includes(x);
  const [q, setQ] = useState(initialQ);
  const [f, setF] = useState<K>(valid(initialF) ? initialF : all);
  // Στο «Πίσω» η σελίδα έρχεται από την προσωρινή μνήμη του router με τις αρχικές τιμές της, γι' αυτό πρώτα διαβάζουμε
  // τη διεύθυνση και μετά γράφουμε (αλλιώς η αναζήτηση σβηνόταν).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const uq = sp.get("q"), uf = sp.get("f");
    if (uq !== null) setQ(uq.slice(0, 80));
    if (valid(uf)) setF(uf);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const u = new URL(window.location.href);
    if (q.trim()) u.searchParams.set("q", q.trim());
    else u.searchParams.delete("q");
    if (f !== all) u.searchParams.set("f", f);
    else u.searchParams.delete("f");
    if (u.href !== window.location.href) window.history.replaceState(null, "", u);
  }, [q, f, ready, all]);
  return { q, setQ, f, setF };
}
