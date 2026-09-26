import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cycleForNewBooking, cycleInfo } from "@/lib/member";
import { bookingWindow, canBook } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour, formatTime } from "@/lib/time";

async function book(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const now = new Date();
  const w = bookingWindow(now, s);
  const date = String(formData.get("date"));
  const hour = Number(formData.get("hour"));

  const mine = await prisma.booking.findMany({
    where: { memberId: user.id, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
    include: { slot: true },
  });
  // Το μέλος διαλέγει ώρα· το app διαλέγει ελεύθερη θέση (δωμάτιο).
  const free = await prisma.slot.findMany({
    where: { date, hour, therapistId: { not: null }, booking: null },
    orderBy: { position: "asc" },
  });
  let error = "Η ώρα δεν είναι πια ελεύθερη.";
  for (const slot of free) {
    const check = canBook({
      now,
      settings: s,
      slot: { ...slot, booked: false },
      memberBookingsThisWeek: mine.map((b) => ({ date: b.slot.date })),
    });
    if (!check.ok) {
      error = check.reason;
      break;
    }
    try {
      const cycleId = await cycleForNewBooking(user.id, s);
      await prisma.booking.create({ data: { slotId: slot.id, memberId: user.id, cycleId } });
      revalidatePath("/m");
      redirect("/m/book?ok=1");
    } catch (e) {
      // Κάποιος άλλος πρόλαβε τη θέση — δοκίμασε την επόμενη.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  redirect(`/m/book?e=${encodeURIComponent(error)}`);
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const user = await requireRole("MEMBER");
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  const now = new Date();
  const w = bookingWindow(now, s);

  const [mine, slots, cycle] = await Promise.all([
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    w.open
      ? prisma.slot.findMany({
          where: {
            date: { gte: w.weekStart, lte: w.weekEnd },
            startsAt: { gt: now },
            therapistId: { not: null },
            booking: null,
          },
          orderBy: { startsAt: "asc" },
        })
      : Promise.resolve([]),
    cycleInfo(user.id),
  ]);

  // Μόνο ώρες με ελεύθερη θέση, μία φορά η καθεμία, όχι στις μέρες που έχει ήδη ραντεβού.
  const bookedDays = new Set(mine.map((b) => b.slot.date));
  const byDay = new Map<string, Set<number>>();
  for (const x of slots) {
    if (bookedDays.has(x.date)) continue;
    if (!byDay.has(x.date)) byDay.set(x.date, new Set());
    byDay.get(x.date)!.add(x.hour);
  }
  const left = Math.max(0, s.sessionsPerWeek - mine.length);

  return (
    <main>
      <h1>Ραντεβού της εβδομάδας</h1>
      {sp.ok && <div className="notice">Το ραντεβού κλείστηκε ✓</div>}
      {sp.e && <div className="error">{sp.e}</div>}

      <section className="card">
        <strong>Τα ραντεβού σου</strong>
        {mine.length === 0 && <p className="muted">Δεν έχεις κλείσει ραντεβού αυτή την εβδομάδα.</p>}
        <ul>
          {mine.map((b) => (
            <li key={b.id}>
              {formatDate(b.slot.date)} στις {formatHour(b.slot.hour)}
              {cycle?.numbers.get(b.id) && <span className="muted"> · συνεδρία {cycle.numbers.get(b.id)} από {cycle.length}</span>}
            </li>
          ))}
        </ul>
      </section>

      {!w.open ? (
        <div className="notice">
          Οι κρατήσεις γίνονται κάθε Δευτέρα έως τις {s.bookingCloseTime}. Για αλλαγή μίλησε με την ομάδα.
        </div>
      ) : left === 0 ? (
        <div className="notice">Έκλεισες και τα {s.sessionsPerWeek} ραντεβού της εβδομάδας.</div>
      ) : (
        <>
          <p className="muted">
            Διάλεξε {left === 1 ? "ακόμα μία ώρα" : `${left} ώρες`}. Οι κρατήσεις κλείνουν στις {formatTime(w.closesAt)}.
          </p>
          {byDay.size === 0 && <div className="notice">Δεν υπάρχουν ελεύθερες ώρες αυτή τη στιγμή.</div>}
          {[...byDay.entries()].map(([date, hours]) => (
            <section className="card" key={date}>
              <strong>{formatDate(date)}</strong>
              <div className="row" style={{ marginTop: 8 }}>
                {[...hours].map((h) => (
                  <form action={book} key={h}>
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="hour" value={h} />
                    <button type="submit">{formatHour(h)}</button>
                  </form>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
