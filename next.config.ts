import type { NextConfig } from "next";

// Κανένας κώδικας τρίτων (Google, Facebook κ.λπ.) δεν φορτώνεται στο app.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https:", // οι φόρμες «Μπες…» ανακατευθύνουν στο δωμάτιο βίντεο
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // same-origin (όχι no-referrer): με no-referrer ο browser στέλνει «Origin: null» στις φόρμες
          // και το Next.js απορρίπτει την είσοδο με 500. Προς άλλους ιστότοπους δεν φεύγει τίποτα.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
