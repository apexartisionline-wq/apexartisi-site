"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "@/app/t/tour-actions";
import type { TourStep } from "@/lib/tours";

type Rect = { top: number; left: number; width: number; height: number };
type Side = "right" | "left" | "below" | "above";

const PAD = 6; // περιθώριο γύρω από το φωτισμένο σημείο
const GAP = 14; // απόσταση κουτιού από το σημείο (εκεί μπαίνει το βελάκι)
const W = 380; // πλάτος κουτιού σε μεγάλη οθόνη

// Ξενάγηση: σκουραίνει τη σελίδα, φωτίζει ένα σημείο και δείχνει δίπλα ένα κουτάκι με βελάκι προς αυτό.
// Ανοίγει μόνη της την πρώτη φορά· μετά, από το κουμπί «Ξενάγηση».
export function Tour({ id, name, steps: all, auto }: { id: string; name: string; steps: TourStep[]; auto: boolean }) {
  const [i, setI] = useState<number | null>(null);
  // Δείχνονται μόνο τα βήματα που ταιριάζουν με ό,τι υπάρχει τώρα στη σελίδα: αν λείπει το σημείο
  // που περιγράφει ένα βήμα, το βήμα παραλείπεται (για να μη λέει κάτι που δεν φαίνεται).
  const [steps, setSteps] = useState<TourStep[]>(all);
  const pickSteps = useCallback(() => {
    const visible = (sel?: string) => {
      if (!sel) return true;
      const el = document.querySelector(sel) as HTMLElement | null;
      return Boolean(el && el.getClientRects().length);
    };
    setSteps(all.filter((s) => visible(s.target) && (!s.when || document.querySelector(s.when)) && !(s.unless && document.querySelector(s.unless))));
  }, [all]);
  // Το κουμπί «Ξενάγηση» μπαίνει στο πάνω μενού (για να μη σκεπάζει τίποτα στη σελίδα).
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => setSlot(document.querySelector("nav.top")), []);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const bubble = useRef<HTMLDivElement>(null);
  const [bh, setBh] = useState(200); // ύψος κουτιού, για να μη βγαίνει έξω από την οθόνη
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
    setVp({ w: window.innerWidth, h: window.innerHeight });
    if (bubble.current) setBh(bubble.current.offsetHeight);
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
    // Η σελίδα μπορεί να μετακινηθεί λίγο μετά (εικόνες, γραμματοσειρές, άνοιγμα λεπτομερειών):
    // ξαναμετράμε για λίγο, ώστε ο φωτισμός να μένει ακριβώς πάνω σε αυτό που λέει το κείμενο.
    let n = 0;
    let raf = 0;
    const tick = () => {
      measure();
      if (++n < 30) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (el && ro) ro.observe(el);
    if (ro) ro.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
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

  // Θέση κουτιού: δίπλα στο σημείο (δεξιά ή αριστερά), αλλιώς από κάτω ή από πάνω — ποτέ πάνω του.
  // Στο κινητό (στενή οθόνη) το κουτί κάθεται κάτω-κάτω και το σημείο ανεβαίνει από πάνω του.
  const { w: vw, h: vh } = vp;
  const narrow = vw > 0 && vw < 640;
  const width = Math.min(W, vw - 16);
  let side: Side | null = null;
  if (rect && !narrow) {
    const r = { top: rect.top - PAD, left: rect.left - PAD, right: rect.left + rect.width + PAD, bottom: rect.top + rect.height + PAD };
    if (r.right + GAP + width + 8 <= vw) side = "right";
    else if (r.left - GAP - width - 8 >= 0) side = "left";
    else if (r.bottom + GAP + bh + 8 <= vh) side = "below";
    else if (r.top - GAP - bh - 8 >= 0) side = "above";
  }
  let pos: React.CSSProperties | undefined;
  let arrow: React.CSSProperties | undefined;
  if (rect && side) {
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    if (side === "right" || side === "left") {
      // Το βελάκι δείχνει στην αρχή του σημείου (εκεί που είναι ο τίτλος του).
      const aim = clamp(rect.top + Math.min(rect.height / 2, 28), 16, vh - 16);
      const top = clamp(aim - 36, 8, vh - bh - 8);
      const left = side === "right" ? rect.left + rect.width + PAD + GAP : rect.left - PAD - GAP - width;
      pos = { top, left, width };
      arrow = { top: clamp(aim - top - 8, 14, bh - 30) };
    } else {
      const aim = rect.left + Math.min(rect.width / 2, 80);
      const left = clamp(aim - 60, 8, vw - width - 8);
      const top = side === "below" ? rect.top + rect.height + PAD + GAP : rect.top - PAD - GAP - bh;
      pos = { top, left, width };
      arrow = { left: clamp(aim - left - 8, 16, width - 32) };
    }
  }
  const centered = !rect;
  const corner = Boolean(rect) && !narrow && !side; // το σημείο πιάνει όλη την οθόνη

  return (
    <>
      {slot && createPortal(<button type="button" className="tour-btn" onClick={start}>? Ξενάγηση</button>, slot)}
      {step && (
        <div className="tour" role="dialog" aria-modal="true" aria-label={`Ξενάγηση: ${name}`}>
          {rect ? (
            <div key={`s${i}`} className="tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
          ) : (
            <div className="tour-dim" />
          )}
          <div
            key={`b${i}`}
            ref={bubble}
            className={`tour-bubble${centered ? " center" : ""}${narrow && !centered ? " bottom" : ""}${corner ? " corner" : ""}`}
            style={pos}
          >
            {side && <span className={`tour-arrow ${side}`} style={arrow} aria-hidden="true" />}
            <div className="tour-head">
              <span className="tour-name">{name}</span>
              <span className="tour-count">{i! + 1} / {steps.length}</span>
            </div>
            <h3 className="tour-title">{step.title}</h3>
            <p className="tour-text">{step.text}</p>
            <div className="tour-dots" aria-hidden="true">
              {steps.map((_, k) => <i key={k} className={k === i ? "on" : k < i! ? "done" : ""} />)}
            </div>
            <div className="tour-actions">
              <button type="button" className="tour-skip" onClick={close}>Κλείσιμο</button>
              <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                {i! > 0 && <button type="button" onClick={() => setI(i! - 1)}>‹ Πίσω</button>}
                {i! < steps.length - 1 ? (
                  <button type="button" className="primary" onClick={() => setI(i! + 1)} autoFocus>Επόμενο ›</button>
                ) : (
                  <button type="button" className="primary" onClick={close} autoFocus>Τέλος ✓</button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
