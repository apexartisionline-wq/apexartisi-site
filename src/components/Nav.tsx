import Link from "next/link";
import { getSettings } from "@/lib/settings";

export async function Nav({ links }: { links: { href: string; label: string }[] }) {
  const s = await getSettings();
  return (
    <nav className="top">
      <Link href="/" className="brand">
        <img src={s.logoUrl || "/icon.svg"} alt="" />
        {s.appName}
      </Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href}>{l.label}</Link>
      ))}
      <form action="/logout" method="post">
        <button type="submit" style={{ padding: "6px 10px" }}>Έξοδος</button>
      </form>
    </nav>
  );
}
