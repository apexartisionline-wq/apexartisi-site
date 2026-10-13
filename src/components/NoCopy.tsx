"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { watermarkCss, watermarkWhen } from "@/lib/access";

// Σημειώματα χωρίς αντιγραφή (απόφαση 13/10): στα στοιχεία με υδατογράφημα δεν γίνεται αντιγραφή, αποκοπή,
// σύρσιμο ή δεξί κλικ. Δεν εμποδίζει φωτογραφία οθόνης — γι' αυτό το υδατογράφημα δείχνει ποιος και πότε.
const SEL = ".note-text, .notesum-prev, .wm";

export function NoCopy({ name }: { name: string }) {
  const path = usePathname();
  // Η ώρα του υδατογραφήματος ανανεώνεται σε κάθε σελίδα (το layout δεν ξαναφορτώνεται στις μετακινήσεις).
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".wm-scope");
    if (!el) return;
    const when = watermarkWhen(new Date());
    el.style.setProperty("--wm-l", watermarkCss(name, when));
    el.style.setProperty("--wm-d", watermarkCss(name, when, true));
  }, [path, name]);
  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && Boolean((t instanceof Element ? t : t.parentElement)?.closest(SEL));
    const touchesNotes = () => {
      const s = document.getSelection();
      if (!s || s.rangeCount === 0 || s.isCollapsed) return false;
      const r = s.getRangeAt(0);
      return [...document.querySelectorAll(SEL)].some((el) => r.intersectsNode(el));
    };
    const onCopy = (e: Event) => { if (inside(e.target) || touchesNotes()) e.preventDefault(); };
    const onTarget = (e: Event) => { if (inside(e.target)) e.preventDefault(); };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onTarget);
    document.addEventListener("dragstart", onTarget);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onTarget);
      document.removeEventListener("dragstart", onTarget);
    };
  }, []);
  return null;
}
