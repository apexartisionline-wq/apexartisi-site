import Link from "next/link";
import { getSettings } from "@/lib/settings";

export async function Nav({ links, menu = false }: { links: { href: string; label: string }[]; menu?: boolean }) {
  const many = menu && links.length > 3;
  const s = await getSettings();
  return (
    <nav className="top">
      <Link href="/" className="brand">
        <img src={s.logoUrl || "/icon.svg"} alt="" />
        {s.appName}
      </Link>
      {/* Σελίδες ομάδας στο κινητό: οι σύνδεσμοι μαζεύονται σε ένα «Μενού». */}
      <span className={many ? "navlinks many" : "navlinks"}>
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </span>
      {many && (
        <details className="navmenu">
          <summary className="btn">Μενού</summary>
          <div className="navmenu-list">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </div>
        </details>
      )}
      <form action="/logout" method="post">
        <button type="submit" style={{ padding: "6px 10px" }}>Έξοδος</button>
      </form>
    </nav>
  );
}
