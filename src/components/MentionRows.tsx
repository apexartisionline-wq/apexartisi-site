"use client";

import { useState } from "react";

/**
 * «Προσοχή σε…» του σημειώματος ομάδας (υπεύθυνη 16/10: «να μπορούμε να προσθέσουμε και άλλα»): ξεκινά με 4 γραμμές
 * (ή όσες έχουν ήδη γραφτεί + 1 κενή) και το «+ Προσθήκη μέλους» ανοίγει κι άλλες, ως MAX. Τα ονόματα πεδίων m0/t0, m1/t1…
 * διαβάζονται στον server· κενή γραμμή δεν αποθηκεύεται.
 */
export function MentionRows({ members, initial, max }: { members: { id: string; name: string }[]; initial: { memberId: string; text: string }[]; max: number }) {
  const [rows, setRows] = useState(() => Math.min(max, Math.max(4, initial.length + 1)));
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div className="row mention-row" key={i}>
          <select name={`m${i}`} defaultValue={initial[i]?.memberId ?? ""} aria-label={`Μέλος ${i + 1}`}>
            <option value="">—</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input name={`t${i}`} defaultValue={initial[i]?.text ?? ""} maxLength={1000} placeholder="π.χ. μίλησε για υποτροπή" aria-label={`Τι να προσέξουμε (${i + 1})`} />
        </div>
      ))}
      {rows < max && (
        <p style={{ margin: "0 0 12px" }}>
          <button type="button" className="outline sm" onClick={() => setRows((n) => Math.min(max, n + 1))}>+ Προσθήκη μέλους</button>
        </p>
      )}
    </>
  );
}
