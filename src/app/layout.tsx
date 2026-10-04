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
    icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" }, // το iPhone θέλει PNG για την αρχική οθόνη
    appleWebApp: { capable: true, title: s.appName, statusBarStyle: "default" },
  };
}

// viewportFit «cover»: στο iPhone η εφαρμογή γεμίζει την οθόνη και τα περιθώρια μπαίνουν από το CSS (safe-area).
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0c1620" }],
  width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
