"use client";

import { useActionState, useState } from "react";
import { createPerson, resetCode, type CodeState } from "./actions";

function CodeBox({ state }: { state: CodeState }) {
  if (!state) return null;
  if (state.error) return <div className="error">{state.error}</div>;
  const e = state.email;
  return (
    <>
      <div className="notice">
        Όνομα χρήστη: <strong>{state.username}</strong> · Κωδικός: <strong style={{ fontFamily: "monospace", fontSize: "1.2rem" }}>{state.code}</strong>
        <div className="small">Ο κωδικός εμφανίζεται μόνο τώρα. Δώσ' τον προσωπικά — όχι σε ομαδική συνομιλία.</div>
        {e?.status === "sent" && <div className="small">✉︎ Στάλθηκε email στο <strong>{e.to}</strong> με το καλωσόρισμα και τα στοιχεία εισόδου. Το μέλος θα αλλάξει τον κωδικό στην πρώτη είσοδο.</div>}
        {e?.status === "failed" && <div className="small" style={{ color: "var(--danger)" }}>Το email στο {e.to} δεν στάλθηκε{e.detail ? ` (${e.detail})` : ""}. Στείλ' το με το χέρι από το παρακάτω κείμενο.</div>}
        {e?.status === "preview" && <div className="small">Δεν έχει ρυθμιστεί το Gmail του προγράμματος (GMAIL_USER / GMAIL_APP_PASSWORD στο Netlify), οπότε δεν στάλθηκε τίποτα. Αντίγραψε το παρακάτω και στείλ' το στο <strong>{e.to}</strong>.</div>}
      </div>
      {e && e.status !== "sent" && (
        <details className="card small" open>
          <summary>Email προς το μέλος · {e.subject}</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0 0" }}>{e.text}</pre>
        </details>
      )}
    </>
  );
}

export function CreatePersonForm() {
  const [state, action, pending] = useActionState(createPerson, null);
  const [role, setRole] = useState("MEMBER");
  return (
    <form action={action} className="card">
      <CodeBox state={state} />
      <div className="grid2">
        <div className="field"><label>Ονοματεπώνυμο</label><input name="name" required /></div>
        <div className="field"><label>Όνομα χρήστη (λατινικά)</label><input name="username" required autoCapitalize="none" /></div>
        <div className="field"><label>Κινητό (επιβεβαιωμένο)</label><input name="phone" type="tel" /></div>
        {role === "MEMBER" && <div className="field"><label>Email (για το καλωσόρισμα και τον κωδικό)</label><input name="email" type="email" autoCapitalize="none" placeholder="προαιρετικό" /></div>}
        <div className="field">
          <label>Ρόλος</label>
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="MEMBER">Μέλος</option>
            <option value="THERAPIST">Θεραπευτής</option>
            <option value="ADMIN">Διαχείριση</option>
          </select>
        </div>
        {role === "MEMBER" ? (
          <>
            <div className="field">
              <label>Από πού ήρθε</label>
              <select name="source">
                <option value="APEX">apex/rtisi online</option>
                <option value="AUTOGNOSIA_PLUS">ΑΥΤΟΓΝΩΣΙΑ PLUS</option>
              </select>
            </div>
            <div className="field"><label>Έναρξη προγράμματος</label><input name="programStartDate" type="date" /></div>
          </>
        ) : (
          <>
            <div className="field">
              <label>Τύπος (για την εναλλαγή στις ατομικές)</label>
              <select name="therapistKind" defaultValue="">
                <option value="">— (δεν κάνει ατομικές)</option>
                <option value="BIOMATIC">Βιωματικός σύμβουλος</option>
                <option value="CLINICAL">Κλινικός ψυχολόγος</option>
                <option value="BOTH">Και τα δύο</option>
              </select>
            </div>
            <div className="field"><label>Telegram user ID (για «Το αναλαμβάνω»)</label><input name="telegramUserId" inputMode="numeric" /></div>
          </>
        )}
      </div>
      <button className="primary" disabled={pending}>Δημιουργία και κωδικός</button>
    </form>
  );
}

export function ResetCodeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetCode, null);
  return (
    <form action={action} className="card">
      <input type="hidden" name="id" value={id} />
      <CodeBox state={state} />
      <div className="row spread">
        <span>Ξέχασε τον κωδικό του; Πάτα «Νέος κωδικός» και δώσ' του τον καινούργιο (ο παλιός σταματά να δουλεύει και αποσυνδέεται από όλες τις συσκευές). Αν το μέλος έχει email, του στέλνεται και με email. Με τον νέο κωδικό μπαίνει και τον αλλάζει μόνος του.</span>
        <button disabled={pending}>Νέος κωδικός</button>
      </div>
    </form>
  );
}
