import { RISK_CHANGE, type RiskChange, USED_SINCE, type UsedSince } from "@/lib/handover-rules";

// Τα δομημένα πεδία ενός σημειώματος, ως μικρές ετικέτες.
export function NoteTags({ riskChange, usedSince, nextStep, text }: { riskChange: string | null; usedSince: string | null; nextStep?: string; text?: string }) {
  // Αν το «Τι προτείναμε» είναι ήδη μέσα στο σημείωμα, δεν το ξαναγράφουμε.
  if (nextStep && text?.includes(nextStep)) nextStep = undefined;
  if (!riskChange && !usedSince && !nextStep) return null;
  return (
    <div className="small" style={{ marginTop: 6 }}>
      {riskChange && (
        <span className={`badge${riskChange === "UP" ? " red" : ""}`}>Ανάγκες ασφάλειας: {RISK_CHANGE[riskChange as RiskChange] ?? riskChange}</span>
      )}{" "}
      {usedSince && (
        <span className={`badge${usedSince === "YES" ? " red" : usedSince === "UNKNOWN" ? " yellow" : ""}`}>
          Χρήση: {USED_SINCE[usedSince as UsedSince] ?? usedSince}
        </span>
      )}
      {nextStep && <div style={{ marginTop: 4 }}><span className="muted">Τι προτείναμε:</span> {nextStep}</div>}
    </div>
  );
}
