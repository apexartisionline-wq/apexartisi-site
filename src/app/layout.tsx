import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/settings";
import { THEME_COOKIE, themeOf } from "@/lib/theme";
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
// Το χρώμα της μπάρας του κινητού ακολουθεί το θέμα του χρήστη (17/10), όχι τη συσκευή.
export async function generateViewport(): Promise<Viewport> {
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return { themeColor: theme === "dark" ? "#0c1620" : "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

// Θέμα (17/10): πάντα φωτεινό από προεπιλογή· σκούρο μόνο αν το διάλεξε ο χρήστης (cookie που μπαίνει στην είσοδο
// και στον «Λογαριασμό»). Το data-theme το διαβάζει το globals.css (html[data-theme="dark"]).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="el" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
