"use client";

// Σφάλμα στο ίδιο το περίβλημα της εφαρμογής (σπάνιο): ίδια συμπεριφορά με το error.tsx, με δικό του <html>.
import ErrorPage from "./error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="el">
      <body>
        <ErrorPage error={error} reset={reset} />
      </body>
    </html>
  );
}
