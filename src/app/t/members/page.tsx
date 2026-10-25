import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberSafetyMany } from "@/lib/safety-batch";
import { formatDate, formatTime } from "@/lib/time";
import { PageHead } from "@/components/ui";
import { MembersList, type MemberRow } from "@/components/MembersList";

// Όλα τα ενεργά μέλη (όλοι οι θεραπευτές δουλεύουν με όλους). Πρώτα όσοι έχουν σήμα ασφάλειας.
// Ανασχεδιασμός 16/10: αναζήτηση και φίλτρα πάνω στα ΥΠΑΡΧΟΝΤΑ σήματα (memberSafetyMany, ίδιοι κανόνες), κάρτα ανά μέλος
// με όνομα, μία ένδειξη κατάστασης, το πιο σημαντικό σήμα χωριστά από την επόμενη ατομική. Η σελίδα δείχνει ό,τι έδειχνε
// και πριν (όνομα, πρώτο σήμα + πόσα ακόμα, επόμενη ατομική) — καμία νέα πληροφορία, κανένα κείμενο σημειώματος.
export default async function MembersOverview({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  await requireRole("THERAPIST", "ADMIN");
  const now = new Date();
  const [members, sp] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        alumniSince: true,
        bookings: {
          where: { slot: { startsAt: { gt: now } } },
          select: { slot: { select: { date: true, startsAt: true, kind: true, therapist: { select: { name: true } } } } },
          orderBy: { slot: { startsAt: "asc" } },
          take: 1,
        },
      },
    }),
    searchParams,
  ]);
  // Όλα τα μέλη μαζί, με λίγες ερωτήσεις (15/10, ίδιο με το «Σήμερα»).
  const safety = await memberSafetyMany(members.map((m) => m.id), now);
  const rank = (l: MemberRow["level"]) => (l === "red" ? 0 : l === "yellow" ? 1 : 2);
  const rows: MemberRow[] = members
    .map((m) => {
      const flags = safety.get(m.id) ?? [];
      const top = flags[0];
      const next = m.bookings[0]?.slot;
      return {
        id: m.id,
        name: m.name,
        level: top?.level ?? null,
        top: top?.text ?? null,
        more: Math.max(0, flags.length - 1),
        overdue: flags.some((f) => f.key === "risk_review" && f.level === "red"),
        noRecord: flags.some((f) => f.key === "no_record"),
        alumnus: Boolean(m.alumniSince),
        next: next ? { when: formatDate(next.date), time: formatTime(next.startsAt), who: next.therapist?.name ?? null, pair: next.kind === "PAIR" } : null,
      };
    })
    .sort((a, b) => rank(a.level) - rank(b.level));

  return (
    <main className="members-page">
      <PageHead title="Μέλη" sub={rows.length === 1 ? "1 ενεργό μέλος" : `${rows.length} ενεργά μέλη`} />
      <MembersList rows={rows} initialQ={typeof sp.q === "string" ? sp.q.slice(0, 80) : ""} initialF={sp.f ?? "all"} />
    </main>
  );
}
