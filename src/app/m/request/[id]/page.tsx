import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/notify";
import { canRequestChange } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour } from "@/lib/time";

async function load(id: string, memberId: string) {
  return prisma.booking.findFirst({ where: { id, memberId }, include: { slot: true } });
}

// Αίτημα αλλαγής/ακύρωσης: το μέλος το στέλνει έως 12 ώρες πριν· το εκτελεί η Εύα.
async function send(formData: FormData) {
  "use server";
  const user = await requireMember();
  const s = await getSettings();
  const id = String(formData.get("id"));
  const b = await load(id, user.id);
  if (!b || !canRequestChange(b.slot.startsAt, new Date(), s)) redirect("/m?e=late");
  const kind = z.enum(["CANCEL", "CHANGE"]).parse(formData.get("kind"));
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);
  const exists = await prisma.changeRequest.findFirst({ where: { bookingId: id, status: "PENDING" } });
  if (!exists) {
    await prisma.changeRequest.create({ data: { bookingId: id, memberId: user.id, kind, message, sessionAt: b.slot.startsAt } });
    await notifyRole("ADMIN", { title: "Νέο αίτημα αλλαγής ραντεβού", url: "/admin/requests", tag: "request" });
  }
  redirect("/m?req=1");
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const [b, s] = await Promise.all([load(id, user.id), getSettings()]);
  if (!b) notFound();
  const allowed = canRequestChange(b.slot.startsAt, new Date(), s);
  return (
    <main>
      <h1>Αίτημα αλλαγής ή ακύρωσης</h1>
      <p className="muted">{formatDate(b.slot.date)} στις {formatHour(b.slot.hour)}</p>
      {!allowed ? (
        <div className="notice">Τα αιτήματα γίνονται έως {s.changeRequestHours} ώρες πριν από το ραντεβού.</div>
      ) : (
        <form action={send} className="card">
          <input type="hidden" name="id" value={b.id} />
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <label className="row" style={{ gap: 8 }}>
              <input type="radio" name="kind" value="CHANGE" defaultChecked style={{ width: "auto" }} /> Θέλω να αλλάξω ώρα
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input type="radio" name="kind" value="CANCEL" style={{ width: "auto" }} /> Θέλω να ακυρώσω
            </label>
          </fieldset>
          <div className="field">
            <label htmlFor="message">Τι σε βολεύει; (προαιρετικό)</label>
            <textarea id="message" name="message" style={{ minHeight: 80 }} placeholder="π.χ. Πέμπτη απόγευμα" />
          </div>
          <button className="primary" type="submit">Στείλε το αίτημα</button>
          <p className="muted small">Την αλλαγή την κάνει η ομάδα· θα δεις την απάντηση στην αρχική σου σελίδα.</p>
        </form>
      )}
    </main>
  );
}
