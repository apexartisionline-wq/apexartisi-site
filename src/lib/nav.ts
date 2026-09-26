import type { Role } from "@prisma/client";

// Κάθε ρόλος βλέπει μόνο τα δικά του μενού.
export function navLinks(role: Role): { href: string; label: string }[] {
  if (role === "ADMIN")
    return [
      { href: "/admin", label: "Σήμερα" },
      { href: "/admin/slots", label: "Θέσεις" },
      { href: "/admin/bookings", label: "Ραντεβού" },
      { href: "/admin/consistency", label: "Συνέπεια" },
      { href: "/admin/people", label: "Άνθρωποι" },
      { href: "/admin/content", label: "Κείμενα" },
      { href: "/admin/help", label: "Κόκκινο κουμπί" },
      { href: "/admin/settings", label: "Ρυθμίσεις" },
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
    { href: "/account", label: "Λογαριασμός" },
  ];
}
