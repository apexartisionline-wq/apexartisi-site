"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Το «Μενού»: κλείνει μόνο του μόλις πας σε άλλη σελίδα. */
export function NavMenu({ links, always }: { links: { href: string; label: string }[]; always: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  return (
    <details ref={ref} className={always ? "navmenu always" : "navmenu"}>
      <summary className="btn">Μενού</summary>
      <div className="navmenu-list">
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => ref.current && (ref.current.open = false)}>{l.label}</Link>
        ))}
      </div>
    </details>
  );
}
