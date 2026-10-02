import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SlotKind } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, athensToUtc, formatDate, formatHour, localParts, mondayOf } from "@/lib/time";

const POSITIONS = [1, 2, 3, 4];
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function saveDay(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const date = String(formData.get("date"));
  if (!isDate(date)) throw new Error("bad date");
  const [existing, therapists] = await Promise.all([
    prisma.slot.findMany({ where: { date }, include: { _count: { select: { bookings: true } } } }),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] } }, select: { id: true, therapistKind: true } }),
  ]);
  const kindOf = new Map(therapists.map((t) => [t.id, t.therapistKind]));
  const byKey = new Map(existing.map((x) => [`${x.hour}_${x.position}`, x]));
  const blocked: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("t_")) continue;
    const [, h, p] = key.split("_");
    const hour = Number(h);
    const position = Number(p);
    const therapistId = String(raw) || null;
    const kind: SlotKind = formData.get(`k_${hour}_${position}`) ? "PAIR" : "INDIVIDUAL";
    const slot = byKey.get(`${hour}_${position}`);
    const booked = slot?._count.bookings ?? 0;
    if (!therapistId) {
      if (!slot) continue;
      // Θέσεις με κράτηση δεν κλείνουν από εδώ (πρώτα ακύρωση/μεταφορά στα Ραντεβού).
      if (booked) blocked.push(`${formatHour(hour)} δωμ. ${position}`);
      else await prisma.slot.delete({ where: { id: slot.id } });
      continue;
    }
    if (slot) {
      const kindChange = slot.kind !== kind && !(booked > 1 && kind === "INDIVIDUAL");
      if (slot.therapistId !== therapistId || kindChange) {
        await prisma.slot.update({ where: { id: slot.id }, data: { therapistId, ...(kindChange ? { kind } : {}) } });
        if (slot.therapistId !== therapistId && booked) {
          // Η Εύα άλλαξε θεραπευτή: η εναλλαγή θεωρείται ελεγμένη.
          const tk = kindOf.get(therapistId);
          await prisma.booking.updateMany({
            where: { slotId: slot.id },
            data: { alternationOk: true, ...(tk && tk !== "BOTH" ? { kind: tk } : {}) },
          });
        }
      }
    } else {
      await prisma.slot.create({ data: { date, hour, position, kind, therapistId, startsAt: athensToUtc(date, hour) } });
    }
  }
  revalidatePath("/admin/slots");
  const e = blocked.length ? `&e=${encodeURIComponent(`Δεν κλείνουν γιατί έχουν κράτηση: ${blocked.join(", ")}`)}` : "&ok=1";
  redirect(`/admin/slots?date=${date}${e}`);
}

async function copyPreviousWeek(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const date = String(formData.get("date"));
  if (!isDate(date)) throw new Error("bad date");
  const monday = mondayOf(date);
  const prev = await prisma.slot.findMany({ where: { date: { gte: addDays(monday, -7), lte: addDays(monday, -1) } } });
  for (const x of prev) {
    const d = addDays(x.date, 7);
    await prisma.slot.upsert({
      where: { date_hour_position: { date: d, hour: x.hour, position: x.position } },
      create: { date: d, hour: x.hour, position: x.position, kind: x.kind, therapistId: x.therapistId, startsAt: athensToUtc(d, x.hour) },
      update: {},
    });
  }
  redirect(`/admin/slots?date=${date}&ok=1`);
}

const KIND_LABEL = { BIOMATIC: "Β", CLINICAL: "Κ", BOTH: "Β+Κ" } as const;

export default async function SlotsPage({ searchParams }: { searchParams: Promise<{ date?: string; ok?: string; e?: string }> }) {
  const sp = await searchParams;
  const date = isDate(sp.date) ? sp.date : localParts(new Date()).date;
  const monday = mondayOf(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [s, therapists, slots, weekCounts] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.slot.findMany({ where: { date }, include: { bookings: { include: { member: { select: { name: true } } } } } }),
    prisma.slot.groupBy({ by: ["date"], where: { date: { gte: monday, lte: addDays(monday, 6) } }, _count: true }),
  ]);
  const byKey = new Map(slots.map((x) => [`${x.hour}_${x.position}`, x]));
  const hours = [...new Set([...s.sessionHours, ...slots.map((x) => x.hour)])].sort((a, b) => a - b);
  const counts = new Map(weekCounts.map((c) => [c.date, c._count]));

  return (
    <>
      <h1>Θέσεις ατομικών και Therapair</h1>
      <p className="muted">
        Διάλεξε θεραπευτή για να ανοίξει μια θέση («—» = κλειστή). Τσέκαρε «Therapair» για θέση δύο μελών ({s.pairMinutes}′).
        Μέρες ατομικών στις ρυθμίσεις: {s.sessionDays.map((d) => formatDate(addDays(monday, (d + 6) % 7)).split(" ")[0]).join(", ")}.
      </p>
      <div className="row">
        <Link href={`/admin/slots?date=${addDays(monday, -7)}`}>← εβδομάδα</Link>
        {week.map((d) => (
          <Link key={d} href={`/admin/slots?date=${d}`} className={`btn${d === date ? " primary" : ""}`}>
            {formatDate(d)} <span className="small">({counts.get(d) ?? 0})</span>
          </Link>
        ))}
        <Link href={`/admin/slots?date=${addDays(monday, 7)}`}>εβδομάδα →</Link>
      </div>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.e && <div className="error">{sp.e}</div>}

      <form action={saveDay} className="card table-wrap">
        <input type="hidden" name="date" value={date} />
        <table>
          <thead>
            <tr>
              <th>{formatDate(date)}</th>
              {POSITIONS.map((p) => <th key={p}>Δωμάτιο {p}</th>)}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td><strong>{formatHour(h)}</strong></td>
                {POSITIONS.map((p) => {
                  const x = byKey.get(`${h}_${p}`);
                  return (
                    <td key={p}>
                      <select name={`t_${h}_${p}`} defaultValue={x?.therapistId ?? ""}>
                        <option value="">—</option>
                        {therapists.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.therapistKind ? ` (${KIND_LABEL[t.therapistKind]})` : ""}
                          </option>
                        ))}
                      </select>
                      <label className="row small" style={{ gap: 4, margin: "4px 0 0" }}>
                        <input type="checkbox" name={`k_${h}_${p}`} defaultChecked={x?.kind === "PAIR"} style={{ width: "auto" }} /> Therapair
                      </label>
                      {x?.bookings.map((b) => <div key={b.id} className="small">📌 {b.member.name}</div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit">Αποθήκευση ημέρας</button>
        </div>
      </form>

      <form action={copyPreviousWeek} className="card row spread">
        <input type="hidden" name="date" value={date} />
        <span>Αντιγραφή όλων των θέσεων (με θεραπευτές και Therapair) της προηγούμενης εβδομάδας σε αυτή, όσες δεν υπάρχουν ήδη.</span>
        <button type="submit">Αντιγραφή</button>
      </form>
    </>
  );
}
