"use client";

import { useActionState, useState } from "react";
import { createPerson, resetCode, type CodeState } from "./actions";

function CodeBox({ state }: { state: CodeState }) {
  if (!state) return null;
  if (state.error) return <div className="error">{state.error}</div>;
  return (
    <div className="notice">
      Όνομα χρήστη: <strong>{state.username}</strong> · Κωδικός: <strong style={{ fontFamily: "monospace", fontSize: "1.2rem" }}>{state.code}</strong>
      <div className="small">Ο κωδικός εμφανίζεται μόνο τώρα. Δώσ' τον προσωπικά — όχι σε ομαδική συνομιλία.</div>
    </div>
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
        <span>Ξέχασε τον κωδικό του; Πάτα «Νέος κωδικός» και δώσ' του τον καινούργιο (ο παλιός σταματά να δουλεύει και αποσυνδέεται από όλες τις συσκευές). Με τον νέο κωδικό μπαίνει και τον αλλάζει μόνος του.</span>
        <button disabled={pending}>Νέος κωδικός</button>
      </div>
    </form>
  );
}
