import Link from "next/link";
import { formatDate } from "@/lib/time";

export type ThemeContent = { id: string; title: string; date: string };

// Η θεματική της εβδομάδας και το κείμενο της ημέρας, όπως τα βλέπει το μέλος — για να ξέρει ο θεραπευτής τι δουλεύει.
export function ThemeWeek({ forms, dailyText, compact }: { forms: ThemeContent[]; dailyText: ThemeContent | null; compact?: boolean }) {
  return (
    <>
      <h2 data-tour="theme" style={compact ? { marginTop: 12 } : undefined}>Θεματική της εβδομάδας</h2>
      {forms.length === 0 && !dailyText ? (
        <p className="muted">Δεν έχει ανέβει φόρμα για αυτή την εβδομάδα. <Link href="/t/material">Όλο το υλικό ›</Link></p>
      ) : (
        <div className="list">
          {forms.map((f, i) => (
            <Link key={f.id} href={`/t/material/c/${f.id}`}>
              <span><div className="title">Φόρμα {i + 1} · {f.title}</div><div className="sub">{formatDate(f.date)}</div></span>
            </Link>
          ))}
          {dailyText && (
            <Link href={`/t/material/c/${dailyText.id}`}>
              <span><div className="title">{dailyText.title}</div><div className="sub">Κείμενο της ημέρας · {formatDate(dailyText.date)}</div></span>
            </Link>
          )}
        </div>
      )}
      {(forms.length > 0 || dailyText) && <p className="small" style={{ margin: "6px 0 0" }}><Link href="/t/material">Όλα τα κείμενα, οι φόρμες και η βιβλιοθήκη ›</Link></p>}
    </>
  );
}
