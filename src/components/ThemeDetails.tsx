export type ThemeDetail = { id: string; label: string; title: string; body: string; url: string | null };

// Η φόρμα της θεματικής (ή το κείμενο της ημέρας) ανοιχτή μέσα στη σελίδα, για να τη διαβάζει ο θεραπευτής
// χωρίς να φύγει από το σημειωματάριο. Ένα πάτημα ανοίγει, ένα κλείνει.
export function ThemeDetails({ items, intro }: { items: ThemeDetail[]; intro?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="theme-details">
      {intro && <p className="small muted" style={{ margin: "6px 0 2px" }}>{intro}</p>}
      {items.map((t) => (
        <details key={t.id} className="card" style={{ padding: "6px 10px", margin: "4px 0" }}>
          <summary style={{ cursor: "pointer" }}><strong>{t.label}</strong>{t.label !== t.title && ` · ${t.title}`}</summary>
          {t.body ? <div className="body-text small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{t.body}</div> : <p className="small muted" style={{ margin: "6px 0 0" }}>Μόνο τίτλος, χωρίς κείμενο.</p>}
          {t.url && (
            <p className="small" style={{ margin: "6px 0 2px" }}>
              <a href={t.url} target="_blank" rel="noopener noreferrer">Άνοιξε τη φόρμα Google σε νέα καρτέλα ↗</a>
              <span className="muted"> · το σημειωματάριο μένει εδώ</span>
            </p>
          )}
        </details>
      ))}
    </div>
  );
}
