import Link from "next/link";
import { EmptyState, ErrorNote, PageHead, Panel } from "@/components/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/intake";
import { bookHour, cancelBooking, openHours } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/notify";
import { sessionOrders } from "@/lib/session-order-db";
import { bookingWindow, canRequestChange, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { DAY_NAMES, formatDate, formatHour, formatTime } from "@/lib/time";
import { RedirectType } from "next/navigation";

const KINDS = { INDIVIDUAL: "Ατομική", PAIR: "Therapair" } as const;

async function book(formData: FormData) {
  "use server";
  const user = await requireMember();
  // Το Therapair το ορίζει η διαχείριση (μέρα, ώρα, ζευγάρι)· το μέλος κλείνει μόνο ατομικές (κανόνας CLAUDE.md, εφαρμόστηκε 20/10).
  const res = await bookHour({
    memberId: user.id,
    date: String(formData.get("date")),
    hour: Number(formData.get("hour")),
    kind: "INDIVIDUAL",
  });
  revalidatePath("/m");
  redirect(res.ok ? "/m/book?ok=1" : `/m/book?e=${encodeURIComponent(res.reason)}`, RedirectType.replace);
}

// Ακύρωση: μόνο όσο είναι ανοιχτές οι κρατήσεις και μόνο για ραντεβού αυτής της εβδομάδας.
async function undo(formData: FormData) {
  "use server";
  const user = await requireMember();
  const s = await getSettings();
  const w = bookingWindow(new Date(), s);
  const b = await prisma.booking.findFirst({
    where: { id: String(formData.get("id")), memberId: user.id },
    include: { slot: true },
  });
  if (!w.open || !b || b.slot.startsAt <= new Date() || b.slot.date < w.weekStart || b.slot.date > w.weekEnd) redirect("/m/book");
  await cancelBooking(b.id, { byId: user.id, reason: "Ακύρωση από το μέλος" });
  // Η διαχείριση (που φτιάχνει το πρόγραμμα) το μαθαίνει αμέσως· οι θεραπευτές το βλέπουν στο «Σήμερα» τους.
  await notifyRole("ADMIN", { title: "Ακύρωση ατομικής από μέλος", body: `${user.name} · ${formatDate(b.slot.date)} ${formatTime(b.slot.startsAt)}`, url: "/admin/bookings" }).catch(() => undefined);
  revalidatePath("/m");
  redirect("/m/book?undone=1", RedirectType.replace);
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; undone?: string; c?: string; u?: string }>;
}) {
  const user = await requireMember();
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  const now = new Date();
  const w = bookingWindow(now, s);

  const [mine, hours, pending] = await Promise.all([
    prisma.booking.findMany({
      where: { memberId: user.id, slot: { date: { gte: w.weekStart, lte: w.weekEnd } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    w.open ? openHours(w.weekStart, w.weekEnd, now) : Promise.resolve([]),
    prisma.changeRequest.findMany({ where: { memberId: user.id, status: "PENDING" }, select: { bookingId: true } }),
  ]);
  const pendingFor = new Set(pending.map((r) => r.bookingId));
  const firstUpcoming = mine.find((b) => b.slot.kind === "INDIVIDUAL" && b.slot.startsAt > now);
  // Ακύρωση με επιβεβαίωση (20/10), όπως η κράτηση: ?u=<κράτηση>.
  const undoing = sp.u ? mine.find((b) => b.id === sp.u && w.open && b.slot.startsAt > now) : undefined;
  // «6η ατομική» από την αρχή (όχι «6 από 8» — υπεύθυνη 20/10: το μέτρημα του πακέτου θυμίζει χρέωση). Ίδιος κανόνας με την ομάδα.
  const orders = await sessionOrders(mine.filter((b) => b.slot.kind === "INDIVIDUAL").map((b) => ({ id: b.slot.id, startsAt: b.slot.startsAt, memberId: user.id })));

  // Μόνο ώρες ατομικών με ελεύθερη θέση, όχι στις μέρες που έχει ήδη ραντεβού (το Therapair δεν το κλείνει το μέλος).
  const bookedDays = new Set(mine.map((b) => b.slot.date));
  const visible = hours.filter((h) => h.kind === "INDIVIDUAL" && !bookedDays.has(h.date));
  const days = [...new Set(visible.map((h) => h.date))];
  const left = Math.max(0, s.sessionsPerWeek - mine.length);

  // Βήμα επιβεβαίωσης: ?c=ημερομηνία|ώρα|είδος
  const [cDate, cHour, cKind] = (sp.c ?? "").split("|");
  const confirm = visible.find((h) => h.date === cDate && h.hour === Number(cHour) && h.kind === cKind);

  return (
    <main>
      <PageHead title="Ραντεβού της εβδομάδας" sub={`${formatDate(w.weekStart)} – ${formatDate(w.weekEnd)}`} />
      {sp.ok && <div className="notice">Το ραντεβού κλείστηκε ✓ Μπορείς να το ακυρώσεις μέχρι τις {formatTime(w.closesAt)}.</div>}
      {sp.undone && <div className="notice">Το ραντεβού ακυρώθηκε.</div>}
      {sp.e && <ErrorNote>{sp.e}</ErrorNote>}

      <Panel title="Τα ραντεβού σου" icon="calendar">
        {mine.length === 0 && <EmptyState>Δεν έχεις κλείσει ραντεβού αυτή την εβδομάδα.</EmptyState>}
        {mine.map((b) => (
          <div key={b.id} className="m-row">
            <span className="grow">
              <strong>{formatDate(b.slot.date)} στις {formatTime(b.slot.startsAt)}</strong>
              {/* «Νη ατομική» μόνο στην επόμενη (οι μετέπειτα θα έπαιρναν τον ίδιο αριθμό: μετρούν μόνο οι παρουσίες). */}
              <div className="hint">{KINDS[b.slot.kind]}{b.id === firstUpcoming?.id && orders.get(b.slot.id) && ` · ${orders.get(b.slot.id)!.n}η ατομική`}</div>
            </span>
            {w.open && b.slot.startsAt > now ? (
              <Link className="btn outline sm" href={`/m/book?u=${b.id}`}>Ακύρωση</Link>
            ) : pendingFor.has(b.id) ? (
              <span className="pill grey">αίτημα αλλαγής: σε αναμονή</span>
            ) : canRequestChange(b.slot.startsAt, now, s) ? (
              <Link className="btn outline sm" href={`/m/request/${b.id}`}>Αίτημα αλλαγής ή ακύρωσης</Link>
            ) : null}
          </div>
        ))}
        {undoing && (
          <div className="notice" style={{ marginBottom: 0 }}>
            <p style={{ margin: "0 0 8px" }}><strong>Να ακυρωθεί το ραντεβού {formatDate(undoing.slot.date)} στις {formatTime(undoing.slot.startsAt)};</strong></p>
            <div className="row">
              <form action={undo}>
                <input type="hidden" name="id" value={undoing.id} />
                <button type="submit" className="red">Ναι, ακύρωσέ το</button>
              </form>
              <Link className="btn" href="/m/book">Όχι, πίσω</Link>
            </div>
          </div>
        )}
      </Panel>

      {confirm && left > 0 ? (
        <Panel title="Να το κλείσουμε;" icon="check">
          <p style={{ marginTop: 0 }}>
            <strong>{formatDate(confirm.date)} στις {formatHour(confirm.hour)}</strong> · {KINDS[confirm.kind]} ({slotMinutes(confirm.kind, s)}′)
          </p>
          {confirm.kind === "PAIR" && (
            <p className="hint">Στο Therapair δουλεύεις μαζί με ένα ακόμη μέλος και έναν σύμβουλο. Το ζευγάρι το εγκρίνει η ομάδα.</p>
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
        </Panel>
      ) : !w.open ? (
        <div className="notice">
          Οι κρατήσεις γίνονται κάθε {DAY_NAMES[s.bookingDay]} έως τις {s.bookingCloseTime}. Για αλλαγή ή ακύρωση, πάτα «Αίτημα αλλαγής ή ακύρωσης» δίπλα στο ραντεβού.
        </div>
      ) : left === 0 ? (
        <div className="notice">Έκλεισες {s.sessionsPerWeek === 1 ? "το ραντεβού" : `και τα ${s.sessionsPerWeek} ραντεβού`} της εβδομάδας.</div>
      ) : (
        <>
          <p className="muted">
            Διάλεξε {left === 1 ? (mine.length === 0 ? "μία ώρα" : "ακόμα μία ώρα") : `${left} ώρες`}. Οι κρατήσεις κλείνουν στις {formatTime(w.closesAt)}.
          </p>
          {days.length === 0 && (
            <div className="notice">Δεν υπάρχουν ελεύθερες ώρες αυτή τη στιγμή. Στείλε αίτημα από το «Σήμερα» και θα σε βοηθήσουμε.</div>
          )}
          {days.map((date) => (
            <Panel title={formatDate(date)} key={date}>
              {(["INDIVIDUAL", "PAIR"] as const).map((k) => {
                const hs = visible.filter((h) => h.date === date && h.kind === k);
                if (hs.length === 0) return null;
                return (
                  <div key={k} style={{ marginTop: 8 }}>
                    <div className="hint">{KINDS[k]}</div>
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
            </Panel>
          ))}
        </>
      )}
    </main>
  );
}
