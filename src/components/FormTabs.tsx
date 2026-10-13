"use client";

import { Icon } from "@/components/Icon";

/** Καρτέλες φόρμας: ίσες, πάντα ολόκληρες οι ετικέτες, σαφής ενεργή καρτέλα, ✓ όταν έχει συμπληρωθεί. */
export function FormTabs({ tabs, icons, active, done, onChange, label, idPrefix }: { tabs: readonly string[]; icons?: readonly string[]; active: number; done?: boolean[]; onChange: (i: number) => void; label: string; idPrefix: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t} type="button" role="tab" aria-selected={active === i} aria-controls={`${idPrefix}-${i}`} onClick={() => onChange(i)}>
          {icons?.[i] && <Icon name={icons[i]} size={18} />}
          <span>{t}</span>
          {done?.[i] && <span className="tab-done" aria-label="συμπληρωμένη">✓</span>}
        </button>
      ))}
    </div>
  );
}
