import Link from "next/link";
import { ThemeDetails } from "@/components/ThemeDetails";
import { formatDate } from "@/lib/time";

export type ThemeContent = { id: string; title: string; date: string; body: string; url: string | null };

// Η θεματική της εβδομάδας και το κείμενο της ημέρας, όπως τα βλέπει το μέλος — για να ξέρει ο θεραπευτής τι δουλεύει.
export function ThemeWeek({ forms, dailyText, compact }: { forms: ThemeContent[]; dailyText: ThemeContent | null; compact?: boolean }) {
  return (
    <>
      <h2 data-tour="theme" style={compact ? { marginTop: 12 } : undefined}>Θεματική της εβδομάδας</h2>
      {forms.length === 0 && !dailyText ? (
        <p className="muted">Δεν έχει ανέβει φόρμα για αυτή την εβδομάδα. <Link href="/t/material">Όλο το υλικό ›</Link></p>
      ) : (
        <ThemeDetails
          intro="Πάτα για να ανοίξει εδώ, χωρίς να φύγεις από τη σελίδα."
          items={[
            ...forms.map((f, i) => ({ id: f.id, label: `Φόρμα ${i + 1}`, title: `${f.title} (${formatDate(f.date)})`, body: f.body, url: f.url })),
            ...(dailyText ? [{ id: dailyText.id, label: "Κείμενο της ημέρας", title: `${dailyText.title} (${formatDate(dailyText.date)})`, body: dailyText.body, url: dailyText.url }] : []),
          ]}
        />
      )}
      {(forms.length > 0 || dailyText) && <p className="small" style={{ margin: "6px 0 0" }}><Link href="/t/material">Όλα τα κείμενα, οι φόρμες και η βιβλιοθήκη ›</Link></p>}
    </>
  );
}
