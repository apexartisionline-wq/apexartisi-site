"use client";

import { useEffect } from "react";

/** Σβήνει το πρόχειρο της καρτέλας μόλις αποθηκευτεί το σημείωμα. */
export function ClearDraft({ k }: { k: string }) {
  useEffect(() => {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  }, [k]);
  return null;
}
