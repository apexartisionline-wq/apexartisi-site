import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { bookHour, cancelBooking, openHours } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { cycleInfo } from "@/lib/member";
import { bookingWindow, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatTime } from "@/lib/time";

const KINDS = { INDIVIDUAL: "Ατομική", PAIR: "Therapair" } as const;
type K = keyof typeof KINDS;
const isKind = (k: unknown): k is K => k === "INDIVIDUAL" || k === "PAIR";

async function book(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const kind = String(formData.get("kind"));
  const res = await bookHour({
    memberId: user.id,
    date: String(formData.get("date")),
    hour: Number(formData.get("hour")),
    kind: isKind(kind) ? kind : "INDIVIDUAL",
  });
  revalidatePath("/m");
  redirect(res.ok ? "/m/book?ok=1" : `/m/book?e=${encodeURIComponent(res.reason)}`);
}

// Αναίρεση: μόνο όσο είναι ανοιχτές οι κρατήσεις και μόνο για ραντεβού αυτής της εβδομάδας.
async function undo(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const w = bookingWindow(new Date(), s);
  const b = await prisma.booking.findFirst({
    where: { id: String(formData.get("id")), memberId: user.id },
    include: { slot: true },
  });
  if (!w.open || !b || b.slot.date < w.weekStart || b.slot.date > w.weekEnd) redirect("/m/book");
  await cancelBooking(b.id);
  revalidatePath("/m");
  redirect("/m/book?undone=1");
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; undone?: string; c?: string }>;
}) {
  const user = await requireRole("MEMBER");
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  const now = new Date();
  const w = bookingWindow(now, s);

  const [mine, hours, cycle] = await Promise.all([
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    w.open ? openHours(w.weekStart, w.weekEnd, now) : Promise.resolve([]),
    cycleInfo(user.id),
  ]);

  // Μόνο ώρες με ελεύθερη θέση, όχι στις μέρες που έχει ήδη ραντεβού.
  const bookedDays = new Set(mine.map((b) => b.slot.date));
  const visible = hours.filter((h) => !bookedDays.has(h.date));
  const days = [...new Set(visible.map((h) => h.date))];
  const left = Math.max(0, s.sessionsPerWeek - mine.length);

  // Βήμα επιβεβαίωσης: ?c=ημερομηνία|ώρα|είδος
  const [cDate, cHour, cKind] = (sp.c ?? "").split("|");
  const confirm = visible.find((h) => h.date === cDate && h.hour === Number(cHour) && h.kind === cKind);

  return (
    <main>
      <h1>Ραντεβού της εβδομάδας</h1>
      {sp.ok && <div className="notice">Το ραντεβού κλείστηκε ✓ Μπορείς να το αναιρέσεις μέχρι τις {formatTime(w.closesAt)}.</div>}
      {sp.undone && <div className="notice">Το ραντεβού αναιρέθηκε.</div>}
      {sp.e && <div className="error">{sp.e}</div>}

      <section className="card">
        <strong>Τα ραντεβού σου</strong>
        {mine.length === 0 && <p className="muted">Δεν έχεις κλείσει ραντεβού αυτή την εβδομάδα.</p>}
        {mine.map((b) => (
          <div key={b.id} className="row spread" style={{ marginTop: 8 }}>
            <span>
              {formatDate(b.slot.date)} στις {formatHour(b.slot.hour)} · {KINDS[b.slot.kind]}
              {cycle?.numbers.get(b.id) && <span className="muted"> · ατομική {cycle.numbers.get(b.id)} από {cycle.length}</span>}
            </span>
            {w.open && (
              <form action={undo}>
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" style={{ padding: "6px 10px" }}>Αναίρεση</button>
              </form>
            )}
          </div>
        ))}
      </section>

      {confirm && left > 0 ? (
        <section className="card" style={{ borderColor: "var(--accent)" }}>
          <p>
            <strong>{formatDate(confirm.date)} στις {formatHour(confirm.hour)}</strong> · {KINDS[confirm.kind]} ({slotMinutes(confirm.kind, s)}′)
          </p>
          {confirm.kind === "PAIR" && (
            <p className="muted small">Στο Therapair δουλεύετε δύο μέλη μαζί με έναν σύμβουλο. Το ζευγάρι το εγκρίνει η ομάδα.</p>
          )}
          <div className="row">
            <form action={book}>
              <input type="hidden" name="date" value={confirm.date} />
              <input type="hidden" name="hour" value={confirm.hour} />
              <input type="hidden" name="kind" value={confirm.kind} />
              <button className="primary" type="submit">Ναι, κλείσ' το</button>
            </form>
            <Link className="btn" href="/m/book">Όχι, πίσω</Link>
          </div>
        </section>
      ) : !w.open ? (
        <div className="notice">
          Οι κρατήσεις γίνονται κάθε Δευτέρα έως τις {s.bookingCloseTime}. Για αλλαγή ή ακύρωση στείλε αίτημα από την αρχική σελίδα.
        </div>
      ) : left === 0 ? (
        <div className="notice">Έκλεισες και τα {s.sessionsPerWeek} ραντεβού της εβδομάδας.</div>
      ) : (
        <>
          <p className="muted">
            Διάλεξε {left === 1 ? "ακόμα μία ώρα" : `${left} ώρες`}. Οι κρατήσεις κλείνουν στις {formatTime(w.closesAt)}.
          </p>
          {days.length === 0 && (
            <div className="notice">Δεν υπάρχουν ελεύθερες ώρες αυτή τη στιγμή. Στείλε αίτημα από την αρχική σελίδα και θα σε βοηθήσουμε.</div>
          )}
          {days.map((date) => (
            <section className="card" key={date}>
              <strong>{formatDate(date)}</strong>
              {(["INDIVIDUAL", "PAIR"] as const).map((k) => {
                const hs = visible.filter((h) => h.date === date && h.kind === k);
                if (hs.length === 0) return null;
                return (
                  <div key={k} style={{ marginTop: 8 }}>
                    <div className="muted small">{KINDS[k]}</div>
                    <div className="row" style={{ marginTop: 4 }}>
                      {hs.map((h) => (
                        <Link key={h.hour} className="btn" href={`/m/book?c=${h.date}|${h.hour}|${h.kind}`}>
                          {formatHour(h.hour)}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
