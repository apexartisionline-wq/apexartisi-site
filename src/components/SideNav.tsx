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
  // Διαχείριση (16/10: ίδιο περιβάλλον σε όλους τους ρόλους). Μόνο τα υπάρχοντα εικονίδια.
  "/admin": "calendar",
  "/admin/slots": "clock",
  "/admin/bookings": "list",
  "/admin/requests": "refresh",
  "/admin/groups": "group",
  "/admin/consistency": "chart",
  "/admin/people": "user",
  "/admin/content": "doc",
  "/admin/announcements": "info",
  "/admin/messages": "check",
  "/admin/steps": "target",
  "/admin/library": "folder",
  "/admin/help": "alert",
  "/admin/incidents": "shield",
  "/admin/oncall": "phone",
  "/admin/settings": "compass",
  "/admin/audit": "eye",
  "/admin/retention": "save",
};

/**
 * Πλαϊνό μενού σε υπολογιστή/tablet (≥ 1100px) — του θεραπευτή και (16/10) της διαχείρισης, κατά το προσχέδιο της υπεύθυνης (14/10, ξανά 15/10):
 * λογότυπο πάνω, σελίδες με εικονίδιο, η τρέχουσα τονισμένη· κάτω «Ξενάγηση» (σε έντονο accent, απόφαση 9/10),
 * «Λογαριασμός», «Έξοδος». Σε μικρότερη οθόνη μένει το πάνω μενού με «Μενού».
 */
export function SideNav({ links, home = "/t" }: { links: { href: string; label: string }[]; home?: string }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/t" ? path === "/t" || path.startsWith("/t/s/") || path.startsWith("/t/group") || path.startsWith("/t/help")
    : href === "/admin" ? path === "/admin"
    : path === href || path.startsWith(`${href}/`);
  const main = links.filter((l) => l.href !== "/account");
  const account = links.find((l) => l.href === "/account");
  return (
    <aside className={`sidenav${main.length > 10 ? " dense" : ""}`} aria-label="Κύριο μενού">
      <Link href={home} className="sidenav-brand" aria-label="apex/rtisi online — Σήμερα">
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
