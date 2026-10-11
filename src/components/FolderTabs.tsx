import Link from "next/link";

export type FolderTab = "glance" | "notes" | "journal" | "history" | "safety" | "month";

const TABS: { key: FolderTab; label: string; path: string }[] = [
  { key: "glance", label: "Με μια ματιά", path: "" },
  { key: "notes", label: "Σημειώματα", path: "/notes" },
  { key: "journal", label: "Απογραφές", path: "/journal" },
  { key: "history", label: "Ιστορικό", path: "/assessment" },
  { key: "safety", label: "Ασφάλεια", path: "/risk" },
  { key: "month", label: "Μήνας", path: "/cycle" },
];

// Καρτέλες του φακέλου (σχόλιο θεραπεύτριας 11/10: «να μη χανόμαστε στην πληροφορία»).
// Ίδιες σε όλες τις σελίδες του φακέλου· στο κινητό κυλούν οριζόντια.
export function FolderTabs({ memberId, active }: { memberId: string; active?: FolderTab }) {
  return (
    <nav className="folder-tabs" aria-label="Φάκελος" data-tour="folder-tabs">
      {TABS.map((t) => (
        <Link key={t.key} href={`/t/members/${memberId}${t.path}`} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
