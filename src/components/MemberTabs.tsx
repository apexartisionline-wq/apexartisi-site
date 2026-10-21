"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// Κάτω μπάρα του μέλους στο κινητό (21/10, ιδέα από τις εφαρμογές ανάκαμψης που έδειξε η υπεύθυνη — όλες έχουν tab bar):
// Σήμερα · Ημερολόγιο · [Κόκκινο κουμπί] · Ραντεβού · Μενού. Το κόκκινο κουμπί μένει πάντα ορατό, στο κέντρο, πιο μεγάλο και
// στο χέρι (αντικαθιστά τη γεμάτη κόκκινη μπάρα ΜΟΝΟ στο κινητό· στον υπολογιστή μένει η μπάρα κάτω, όπως ήταν).
// Το «Μενού» ανοίγει φύλλο από κάτω με τους υπόλοιπους συνδέσμους και την «Έξοδο». Σε εκκρεμή έναρξη: Σήμερα · Κόκκινο · Μενού.
// Στη σελίδα του κόκκινου κουμπιού η μπάρα κρύβεται (CSS), όπως κρυβόταν και η παλιά. Προς έγκριση από την υπεύθυνη.
// Σταθερή σειρά στη μπάρα (όχι η σειρά του πάνω μενού): Σήμερα · Ημερολόγιο · [κόκκινο] · Ραντεβού.
const PRIMARY: Record<string, string> = { "/m": "home", "/m/start": "home", "/m/journal": "leaf", "/m/book": "calendar" };
const ORDER = Object.keys(PRIMARY);

export function MemberTabs({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const primary = links.filter((l) => PRIMARY[l.href]).sort((a, b) => ORDER.indexOf(a.href) - ORDER.indexOf(b.href));
  const rest = links.filter((l) => !PRIMARY[l.href]);
  const active = (href: string) => (href === "/m" ? path === "/m" : path.startsWith(href));
  const tab = (l: { href: string; label: string }) => (
    <Link key={l.href} href={l.href} className={active(l.href) ? "tab on" : "tab"} aria-current={active(l.href) ? "page" : undefined}>
      <Icon name={PRIMARY[l.href]} size={22} />
      <span>{l.label}</span>
    </Link>
  );
  return (
    <>
      {open && <div className="m-sheet-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="m-sheet" role="dialog" aria-label="Μενού">
          {rest.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          <form action="/logout" method="post">
            <button type="submit">Έξοδος</button>
          </form>
        </div>
      )}
      <nav className="m-tabs" aria-label="Κύριο μενού">
        {primary.slice(0, 2).map(tab)}
        {/* Το κόκκινο κουμπί στο κέντρο, υπερυψωμένο: ίδια σελίδα (/m/help), ίδια σειρά μέσα της (απόφαση 10/10). */}
        <Link href="/m/help" className="tab tab-red" aria-label="Κόκκινο κουμπί">
          <span className="tab-red-circle"><Icon name="phone" size={24} /></span>
          <span>Κόκκινο κουμπί</span>
        </Link>
        {primary.slice(2).map(tab)}
        <button type="button" className={open ? "tab on" : "tab"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
          <Icon name="menu" size={22} />
          <span>Μενού</span>
        </button>
      </nav>
    </>
  );
}
