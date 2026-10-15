"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

// Εικονίδιο ανά σελίδα του θεραπευτή (όπως στο προσχέδιο της υπεύθυνης, 14/10). Λίγα, γραμμικά, με σαφή σημασία.
const ICON: Record<string, string> = {
  "/t": "calendar",
  "/t/members": "group",
  "/t/consistency": "chart",
  "/t/material": "doc",
  "/t/messages": "chat",
  "/t/lexiko": "compass",
  "/account": "user",
};

/**
 * Πλαϊνό μενού του θεραπευτή σε υπολογιστή/tablet (≥ 1100px), κατά το προσχέδιο της υπεύθυνης (14/10, ξανά 15/10):
 * λογότυπο πάνω, σελίδες με εικονίδιο, η τρέχουσα τονισμένη· κάτω «Ξενάγηση» (σε έντονο accent, απόφαση 9/10),
 * «Λογαριασμός», «Έξοδος». Σε μικρότερη οθόνη μένει το πάνω μενού με «Μενού».
 */
export function SideNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/t" ? path === "/t" || path.startsWith("/t/s/") || path.startsWith("/t/group") || path.startsWith("/t/help") : path === href || path.startsWith(`${href}/`));
  const main = links.filter((l) => l.href !== "/account");
  const account = links.find((l) => l.href === "/account");
  return (
    <aside className="sidenav" aria-label="Κύριο μενού">
      <Link href="/t" className="sidenav-brand" aria-label="apex/rtisi online — Σήμερα">
        <picture>
          <source srcSet="/brand/apexrtisi-online-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/apexrtisi-online.svg" alt="apex/rtisi online" />
        </picture>
      </Link>
      <nav className="sidenav-links">
        {main.map((l) => (
          <Link key={l.href} href={l.href} className={active(l.href) ? "on" : undefined} aria-current={active(l.href) ? "page" : undefined}>
            <Icon name={ICON[l.href] ?? "doc"} size={22} />
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidenav-foot">
        <div className="tour-slot" />
        {account && (
          <Link href={account.href} className={active(account.href) ? "on" : undefined}>
            <Icon name="user" size={20} />
            <span>{account.label}</span>
          </Link>
        )}
        <form action="/logout" method="post">
          <button type="submit" className="sidenav-out"><Icon name="logout" size={20} /> <span>Έξοδος</span></button>
        </form>
      </div>
    </aside>
  );
}
