import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { NavMenu } from "./NavMenu";
import { BrandMark } from "./BrandMark";

export async function Nav({ links, menu = false }: { links: { href: string; label: string }[]; menu?: boolean }) {
  const many = menu && links.length > 3;
  // Πολλοί σύνδεσμοι (διαχείριση): οι πρώτοι φαίνονται, οι υπόλοιποι στο «Μενού» σε κάθε οθόνη.
  const crowded = menu && links.length > 8;
  const s = await getSettings();
  return (
    <nav className={many ? "top has-menu" : "top"}>
      {/* Ομάδα (θεραπευτές, διαχείριση): το πλήρες λογότυπο «apex/rtisi online», όπως στην αλληλογραφία (απόφαση 9/10).
          Μέλη: μόνο το ουδέτερο «Apex» με το δαχτυλίδι, για να μην προδίδει τίποτα στο κινητό τους (απόφαση 4/10). */}
      <Link href="/" className={menu ? "brand brand-full" : "brand"}>
        {menu ? (
          <picture>
            <source srcSet="/brand/apexrtisi-online-dark.svg" media="(prefers-color-scheme: dark)" />
            <img className="brand-logo" src="/brand/apexrtisi-online.svg" alt="apex/rtisi online" />
          </picture>
        ) : (
          <>
            {s.logoUrl ? <img src={s.logoUrl} alt="" /> : <BrandMark />}
            <span className="brand-name">{s.appName}</span>
          </>
        )}
      </Link>
      {/* Σελίδες ομάδας στο κινητό: οι σύνδεσμοι μαζεύονται σε ένα «Μενού». */}
      <span className={many ? "navlinks many" : "navlinks"}>
        {(crowded ? links.slice(0, 4) : links).map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </span>
      {many && <NavMenu links={links} always={crowded} />}
      <form action="/logout" method="post" className={many ? "nav-logout has-menu" : "nav-logout"}>
        <button type="submit" style={{ padding: "6px 10px" }}>Έξοδος</button>
      </form>
    </nav>
  );
}
