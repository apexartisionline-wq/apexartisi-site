"use client";

export function PrintButton({ label = "Λήψη PDF / εκτύπωση" }: { label?: string }) {
  return <button type="button" className="no-print" onClick={() => window.print()}>{label}</button>;
}
