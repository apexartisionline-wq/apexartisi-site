"use client";

import { useEffect, useRef } from "react";

/**
 * Βοηθήματα για τα σημειωματάρια (ατομική και Therapair):
 * - τα κουτιά κειμένου μεγαλώνουν όσο γράφεις (δεν κόβεται το κείμενο),
 * - Ctrl/Cmd + Enter = Αποθήκευση,
 * - με «Αλλαγή» (?edit=1) η σελίδα πάει μόνη της στο σημειωματάριο και ο κέρσορας στο πρώτο κείμενο.
 */
export function useNoteForm() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const grow = (t: HTMLTextAreaElement) => {
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight + 2}px`;
    };
    form.querySelectorAll("textarea").forEach(grow);
    const onInput = (e: Event) => e.target instanceof HTMLTextAreaElement && grow(e.target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    form.addEventListener("input", onInput);
    form.addEventListener("keydown", onKey);
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.querySelector("textarea")?.focus({ preventScroll: true });
    }
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("keydown", onKey);
    };
  }, []);
  return ref;
}
