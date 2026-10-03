"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "@/app/t/tour-actions";
import type { TourStep } from "@/lib/tours";

type Rect = { top: number; left: number; width: number; height: number };

// Ξενάγηση: σκουραίνει τη σελίδα, φωτίζει ένα σημείο και δείχνει δίπλα ένα μικρό κείμενο.
// Ανοίγει μόνη της την πρώτη φορά· μετά, από το κουμπί «Ξενάγηση».
export function Tour({ id, name, steps: all, auto }: { id: string; name: string; steps: TourStep[]; auto: boolean }) {
  const [i, setI] = useState<number | null>(null);
  // Βήματα υπό όρους: δείχνονται μόνο αν ταιριάζουν με ό,τι υπάρχει τώρα στη σελίδα.
  const [steps, setSteps] = useState<TourStep[]>(all);
  const pickSteps = useCallback(() => {
    const has = (sel?: string) => !sel || Boolean(document.querySelector(sel));
    setSteps(all.filter((s) => has(s.when) && !(s.unless && document.querySelector(s.unless))));
  }, [all]);
  // Το κουμπί «Ξενάγηση» μπαίνει στο πάνω μενού (για να μη σκεπάζει τίποτα στη σελίδα).
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => setSlot(document.querySelector("nav.top")), []);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = i === null ? null : steps[i];

  const close = useCallback(() => {
    setI(null);
    markTourSeen(id).catch(() => undefined);
  }, [id]);

  const start = useCallback(() => {
    pickSteps();
    setI(0);
  }, [pickSteps]);
  useEffect(() => {
    if (auto) start();
  }, [auto, start]);

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null);
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el || !el.getClientRects().length) return setRect(null);
    // Τίτλος ενότητας: φωτίζεται μαζί με ό,τι έχει από κάτω (όλη η ενότητα, όχι μόνο ο τίτλος).
    const parts = [el, ...(el.tagName === "H2" && el.nextElementSibling ? [el.nextElementSibling as HTMLElement] : [])];
    const rs = parts.map((x) => x.getBoundingClientRect());
    const top = Math.min(...rs.map((r) => r.top));
    const left = Math.min(...rs.map((r) => r.left));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    const right = Math.max(...rs.map((r) => r.right));
    setRect({ top, left, width: right - left, height: bottom - top });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
    if (el) {
      if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
      el.scrollIntoView({ block: el.tagName === "H2" ? "start" : "center", behavior: "instant" as ScrollBehavior });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (i === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => (x !== null && x < steps.length - 1 ? x + 1 : x));
      if (e.key === "ArrowLeft") setI((x) => (x ? x - 1 : x));
      if (e.key === "Tab") {
        // Η εστίαση μένει μέσα στο κουτί της ξενάγησης.
        const btns = [...document.querySelectorAll<HTMLButtonElement>(".tour-bubble button")];
        if (!btns.length) return;
        const at = btns.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, steps.length, close]);

  const pad = 6;
  // Το κείμενο: κάτω από το σημείο αν χωράει, αλλιώς από πάνω· στο κινητό πάντα κάτω-κάτω στην οθόνη.
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  // Κάτω από το σημείο αν χωράει, αλλιώς από πάνω· αν το σημείο πιάνει όλη την οθόνη, στη γωνία κάτω δεξιά.
  // Πρώτα δίπλα στο σημείο (δεξιά ή αριστερά), μετά από κάτω ή από πάνω, αλλιώς στη γωνία — ποτέ πάνω του.
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const W = 360;
  const right = rect && rect.left + rect.width + pad + 16 + W < vw;
  const leftSide = rect && rect.left - pad - 16 - W > 0;
  const below = rect && rect.top + rect.height + 230 < vh;
  const above = rect && rect.top > 240;
  const corner = Boolean(rect) && !narrow && !right && !leftSide && !below && !above;
  const sideTop = rect ? Math.min(Math.max(8, rect.top), vh - 240) : 0;
  const pos: React.CSSProperties | undefined = !rect || narrow || corner
    ? undefined
    : right
      ? { top: sideTop, left: rect.left + rect.width + pad + 16 }
      : leftSide
        ? { top: sideTop, left: rect.left - pad - 16 - W }
        : { top: Math.max(8, below ? rect.top + rect.height + pad + 8 : rect.top - pad - 8 - 220), left: Math.min(Math.max(8, rect.left), vw - W - 8) };

  return (
    <>
      {slot && createPortal(<button type="button" className="tour-btn" onClick={start}>? Ξενάγηση</button>, slot)}
      {step && (
        <div className="tour" role="dialog" aria-modal="true" aria-label={`Ξενάγηση: ${name}`}>
          {rect ? (
            <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
          ) : (
            <div className="tour-dim" />
          )}
          <div className={`tour-bubble${!rect ? " center" : ""}${narrow ? " bottom" : ""}${corner ? " corner" : ""}`} style={pos}>
            <div className="muted small">{name} · {i! + 1} από {steps.length}</div>
            <strong>{step.title}</strong>
            <p style={{ margin: "6px 0 10px" }}>{step.text}</p>
            <div className="row spread" style={{ gap: 6, flexWrap: "nowrap" }}>
              <button type="button" onClick={close}>Κλείσιμο</button>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                {i! > 0 && <button type="button" onClick={() => setI(i! - 1)}>‹ Πίσω</button>}
                {i! < steps.length - 1 ? (
                  <button type="button" className="primary" onClick={() => setI(i! + 1)} autoFocus>Επόμενο ›</button>
                ) : (
                  <button type="button" className="primary" onClick={close} autoFocus>Τέλος</button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
