"use client";

// Σφάλμα στο ίδιο το περίβλημα της εφαρμογής (σπάνιο): ίδια συμπεριφορά με το error.tsx, με δικό του <html>.
import { ErrorView } from "./error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="el">
      <body>
        <ErrorView error={error} onRetry={() => (error.digest ? reset() : window.location.reload())} />
      </body>
    </html>
  );
}
