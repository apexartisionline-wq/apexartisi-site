import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts } from "@/lib/time";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", LINK: "Βίντεο" } as const;

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

// Ό,τι έχει σταλεί στα μέλη, όπως το βλέπουν εκείνα: κείμενα της ημέρας, φόρμες της θεματικής, βιβλιοθήκη.
// Ο θεραπευτής τα βλέπει και πριν βγουν (για να ετοιμαστεί)· σημειώνεται τι δεν έχει φτάσει ακόμα στα μέλη.
export default async function TherapistMaterial() {
  await requireRole("THERAPIST", "ADMIN");
  const now = new Date();
  const today = localParts(now).date;
  const monday = mondayOf(today);
  const [s, items, shared] = await Promise.all([
    getSettings(),
    prisma.content.findMany({
      where: { date: { gte: addDays(today, -28), lte: addDays(today, 7) } },
      orderBy: [{ date: "desc" }, { kind: "asc" }],
      select: { id: true, date: true, kind: true, title: true, url: true },
    }),
    prisma.libraryItem.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, description: true } }),
  ]);
  const out = (c: { date: string; kind: "DAILY_TEXT" | "FORM" }) => isPublished(c.date, c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime, now);
  const week = items.filter((c) => c.kind === "FORM" && c.date >= monday && c.date <= addDays(monday, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const rest = items.filter((c) => !week.includes(c));

  const Row = ({ c, label }: { c: (typeof items)[number]; label?: string }) => (
    <Link href={`/t/material/c/${c.id}`}>
      <span>
        <div className="title">{label ? `${label} · ` : ""}{c.title}</div>
        <div className="sub">
          {formatDate(c.date)} · {c.kind === "DAILY_TEXT" ? "Κείμενο της ημέρας" : "Φόρμα της θεματικής"}
          {!out(c) && <> · <strong>δεν έχει βγει ακόμα στα μέλη</strong></>}
        </div>
      </span>
    </Link>
  );

  return (
    <main>
      <p className="small"><Link className="back" href="/t">‹ Σήμερα</Link></p>
      <h1>Υλικό για τα μέλη</h1>
      <p className="muted">Ό,τι στέλνει η διαχείριση στα μέλη, για να ξέρεις τι δουλεύουν. Οι εργασίες και τα βήματα κάθε μέλους είναι στον φάκελό του.</p>

      <h2>Θεματική αυτής της εβδομάδας</h2>
      {week.length === 0 ? <p className="muted">Δεν έχει ανέβει φόρμα για την εβδομάδα {formatDate(monday)} – {formatDate(addDays(monday, 6))}.</p> : (
        <div className="list">{week.map((c, i) => <Row key={c.id} c={c} label={`Φόρμα ${i + 1}`} />)}</div>
      )}

      <h2>Κείμενα και φόρμες</h2>
      <p className="small muted" style={{ margin: "0 0 8px" }}>Τελευταίες 4 εβδομάδες και ό,τι είναι έτοιμο για τις επόμενες μέρες.</p>
      {rest.length === 0 ? <p className="muted">Δεν υπάρχει κάτι ακόμα.</p> : (
        <div className="list">{rest.map((c) => <Row key={c.id} c={c} />)}</div>
      )}

      <h2>Βιβλιοθήκη (για όλα τα μέλη)</h2>
      {shared.length === 0 ? <p className="muted">Δεν υπάρχει υλικό ακόμα.</p> : (
        <div className="list">
          {shared.map((i) => (
            <Link key={i.id} href={`/t/material/l/${i.id}`}>
              <span>
                <div className="title">{i.title}</div>
                <div className="sub">{KIND[i.kind]}{i.description && ` · ${i.description}`}</div>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
