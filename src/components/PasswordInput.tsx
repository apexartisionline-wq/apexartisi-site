"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** Πεδίο κωδικού με κουμπί εμφάνισης/απόκρυψης (σελίδα εισόδου, 15/10). Το κουμπί είναι type="button": δεν στέλνει τη φόρμα. */
export function PasswordInput({ id, name, placeholder, showLabel, hideLabel }: { id: string; name: string; placeholder: string; showLabel: string; hideLabel: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw-field">
      <input id={id} name={name} type={shown ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder={placeholder} required />
      <button type="button" className="pw-toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? hideLabel : showLabel} aria-pressed={shown} aria-controls={id}>
        <Icon name={shown ? "eye-off" : "eye"} size={22} />
      </button>
    </div>
  );
}
