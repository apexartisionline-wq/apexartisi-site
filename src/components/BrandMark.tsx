// Το σήμα του brand «apex/rtisi online»: δαχτυλίδι που κόβεται διαγώνια πάνω δεξιά (η τομή στον φαύλο κύκλο).
// Ουδέτερο, χωρίς λέξεις — γι' αυτό μπαίνει και στο κινητό των μελών. Χρώμα από το accent του θέματος.
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="8.1 8.1 131.4 131.4" aria-hidden="true" focusable="false">
      <path d="M 109.25 18.50 A 65.68 65.68 0 1 0 124.43 31.95 L 118.13 52.56 A 49.15 49.15 0 1 1 104.16 35.15 Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
