import { RISK_CHANGE, type RiskChange, USED_SINCE, type UsedSince } from "@/lib/handover-rules";

// Τα δομημένα πεδία ενός σημειώματος, ως μικρές ετικέτες.
export function NoteTags({ riskChange, usedSince, nextStep }: { riskChange: string | null; usedSince: string | null; nextStep?: string }) {
  if (!riskChange && !usedSince && !nextStep) return null;
  return (
    <div className="small" style={{ marginTop: 6 }}>
      {riskChange && (
        <span className={`badge${riskChange === "UP" ? " red" : ""}`}>Κίνδυνος: {RISK_CHANGE[riskChange as RiskChange] ?? riskChange}</span>
      )}{" "}
      {usedSince && (
        <span className={`badge${usedSince === "YES" ? " red" : usedSince === "UNKNOWN" ? " yellow" : ""}`}>
          Χρήση: {USED_SINCE[usedSince as UsedSince] ?? usedSince}
        </span>
      )}
      {nextStep && <div style={{ marginTop: 4 }}><span className="muted">Επόμενο βήμα:</span> {nextStep}</div>}
    </div>
  );
}
