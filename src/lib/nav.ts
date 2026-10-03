import type { Role } from "@prisma/client";

// Κάθε ρόλος βλέπει μόνο τα δικά του μενού.
export function navLinks(role: Role, opts: { hasPlan?: boolean; hasMessages?: boolean } = {}): { href: string; label: string }[] {
  if (role === "ADMIN")
    return [
      { href: "/admin", label: "Σήμερα" },
      { href: "/admin/slots", label: "Θέσεις" },
      { href: "/admin/bookings", label: "Ραντεβού" },
      { href: "/admin/requests", label: "Αιτήματα" },
      { href: "/admin/groups", label: "Ομάδες" },
      { href: "/admin/consistency", label: "Συνέπεια" },
      { href: "/admin/people", label: "Άνθρωποι" },
      { href: "/admin/content", label: "Κείμενα" },
      { href: "/admin/announcements", label: "Ανακοινώσεις" },
      { href: "/admin/messages", label: "Μηνύματα μήνα" },
      { href: "/admin/library", label: "Βιβλιοθήκη" },
      { href: "/admin/help", label: "Κόκκινο κουμπί" },
      { href: "/admin/incidents", label: "Συμβάντα" },
      { href: "/admin/oncall", label: "Εφημερίες" },
      { href: "/admin/settings", label: "Ρυθμίσεις" },
      { href: "/admin/audit", label: "Πρόσβαση" },
      { href: "/t", label: "Τα ραντεβού μου" },
      { href: "/account", label: "Λογαριασμός" },
    ];
  if (role === "THERAPIST")
    return [
      { href: "/t", label: "Το πρόγραμμά μου" },
      { href: "/t/members", label: "Μέλη" },
      { href: "/t/consistency", label: "Συνέπεια" },
      { href: "/account", label: "Λογαριασμός" },
    ];
  return [
    { href: "/m", label: "Σήμερα" },
    { href: "/m/book", label: "Ραντεβού" },
    { href: "/m/journal", label: "Ημερολόγιο" },
    { href: "/m/texts", label: "Κείμενα" },
    { href: "/m/library", label: "Βιβλιοθήκη" },
    // Το πλάνο ασφάλειας γράφεται μόνο όταν υπάρχει λόγος· φαίνεται μόνο σε όποιον το έχει.
    ...(opts.hasPlan ? [{ href: "/m/safety", label: "Το πλάνο μου" }] : []),
    // Τα μηνύματα της ομάδας ξαναδιαβάζονται όποτε θέλει (μόλις υπάρξει το πρώτο).
    ...(opts.hasMessages ? [{ href: "/m/message", label: "Από την ομάδα" }] : []),
    { href: "/account", label: "Λογαριασμός" },
  ];
}
