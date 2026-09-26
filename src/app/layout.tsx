import type { Metadata, Viewport } from "next";
import { getSettings } from "@/lib/settings";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  // Ουδέτερο όνομα και εικονίδιο, χωρίς λέξεις που προδίδουν.
  return {
    title: s.appName,
    applicationName: s.appName,
    robots: { index: false, follow: false },
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
    appleWebApp: { capable: true, title: s.appName, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { themeColor: "#2f5d62", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
