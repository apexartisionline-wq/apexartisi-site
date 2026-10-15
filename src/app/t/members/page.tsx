import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberSafetyMany } from "@/lib/safety-batch";
import { formatDate, formatTime } from "@/lib/time";

// Όλα τα ενεργά μέλη (όλοι οι θεραπευτές δουλεύουν με όλους). Λίστα τύπου iOS:
// πρώτα όσοι έχουν σήμα ασφάλειας, με μια τελεία και το πιο σημαντικό σήμα από κάτω.
export default async function MembersOverview() {
  await requireRole("THERAPIST", "ADMIN");
  const now = new Date();
  const members = await prisma.user.findMany({
    where: { role: "MEMBER", active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      bookings: {
        where: { slot: { startsAt: { gt: now } } },
        include: { slot: { include: { therapist: { select: { name: true } } } } },
        orderBy: { slot: { startsAt: "asc" } },
        take: 1,
      },
    },
  });
  // Όλα τα μέλη μαζί, με λίγες ερωτήσεις (15/10, ίδιο με το «Σήμερα»).
  const safety = await memberSafetyMany(members.map((m) => m.id), now);
  const rows = members.map((m) => ({ ...m, flags: safety.get(m.id) ?? [] }));
  const rank = (r: (typeof rows)[number]) => (r.flags[0]?.level === "red" ? 0 : r.flags[0]?.level === "yellow" ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b));

  return (
    <main>
      <h1>Μέλη</h1>
      <div className="list">
        {rows.map((m) => {
          const next = m.bookings[0];
          const top = m.flags[0];
          return (
            <Link key={m.id} href={`/t/members/${m.id}`}>
              <span className={`dot ${top?.level ?? ""}`} aria-label={top ? (top.level === "red" ? "χρειάζεται προσοχή" : "να το δεις") : "χωρίς σήμα"} />
              <span>
                <div className="title">{m.name}</div>
                {top && <div className="sub">{top.text}{m.flags.length > 1 && ` · +${m.flags.length - 1}`}</div>}
                <div className="sub">
                  {next ? `Επόμενη: ${formatDate(next.slot.date)} ${formatTime(next.slot.startsAt)} · ${next.slot.therapist?.name ?? "—"}` : "Χωρίς επόμενη ατομική"}
                </div>
              </span>
            </Link>
          );
        })}
        {rows.length === 0 && <div className="muted">Δεν υπάρχουν ενεργά μέλη.</div>}
      </div>
      <p className="muted small row" style={{ gap: 6 }}>
        <span className="dot red" /> χρειάζεται προσοχή σήμερα <span className="dot yellow" style={{ marginLeft: 8 }} /> να το δεις
      </p>
    </main>
  );
}
