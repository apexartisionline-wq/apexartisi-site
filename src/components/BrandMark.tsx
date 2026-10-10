import type { SVGProps } from "react";

const RING = "M 109.25 18.50 A 65.68 65.68 0 1 0 124.43 31.95 L 118.13 52.56 A 49.15 49.15 0 1 1 104.16 35.15 Z";
// Δεύτερο λεπτό τόξο (απόφαση 10/10, παραλλαγή 4 των σχεδιαστών): πάχος 0,23 του δαχτυλιδιού, κενό 0,55,
// κομμένο από τις ίδιες γραμμές των 17°. Μόνο σε μέγεθος ≥ 40px· το favicon και το εικονίδιο κινητού μένουν σκέτο δαχτυλίδι.
const ECHO = "M 113.09 5.95 A 78.4 78.4 0 1 0 128.74 17.87 L 127.47 21.99 A 74.6 74.6 0 1 1 111.94 9.69 Z";

/** Το σήμα: ανοιχτό δαχτυλίδι (τελικό 5/10)· με `echo` παίρνει και το λεπτό εξωτερικό τόξο. */
export function BrandMark({ className = "brand-mark", echo = false, ...rest }: { className?: string; echo?: boolean } & Omit<SVGProps<SVGSVGElement>, "className">) {
  return (
    <svg className={className} viewBox={echo ? "-5.6 -5.6 158.8 158.8" : "8.1 8.1 131.4 131.4"} aria-hidden="true" focusable="false" {...rest}>
      <path d={RING} fill="currentColor" fillRule="evenodd" />
      {echo && <path d={ECHO} fill="currentColor" fillRule="evenodd" />}
    </svg>
  );
}
