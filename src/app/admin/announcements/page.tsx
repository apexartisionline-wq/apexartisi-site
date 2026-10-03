import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyMembers, notifyUsers } from "@/lib/notify";
import { athensToUtc, formatDate, localParts } from "@/lib/time";

const AUDIENCE = { MEMBERS: "Μέλη", STAFF: "Θεραπευτές", ALL: "Όλοι" } as const;

const schema = z.object({
  audience: z.enum(["MEMBERS", "STAFF", "ALL"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(5000).default(""),
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
});

async function publish(formData: FormData) {
  "use server";
  const eva = await requireRole("ADMIN");
  const d = schema.parse(Object.fromEntries(formData));
  const a = await prisma.announcement.create({
    data: {
      audience: d.audience,
      title: d.title,
      body: d.body,
      // Λήγει στο τέλος της ημέρας που διάλεξε (ώρα Ελλάδας).
      expiresAt: d.expires ? athensToUtc(d.expires, 23, 59) : null,
      createdById: eva.id,
    },
  });
  const roles = a.audience === "MEMBERS" ? ["MEMBER" as const] : a.audience === "STAFF" ? ["THERAPIST" as const, "ADMIN" as const] : undefined;
  const users = await prisma.user.findMany({
    where: { active: true, id: { not: eva.id }, ...(roles ? { role: { in: roles } } : {}) },
    select: { id: true, role: true },
  });
  // Ουδέτερο κείμενο στην οθόνη κλειδώματος· το περιεχόμενο φαίνεται μόνο μέσα στο app.
  const members = users.filter((u) => u.role === "MEMBER").map((u) => u.id);
  const staff = users.filter((u) => u.role !== "MEMBER").map((u) => u.id);
  await Promise.all([
    members.length ? notifyMembers(members, { title: "Νέα ανακοίνωση", url: "/m", tag: "announcement" }) : null,
    staff.length ? notifyUsers(staff, { title: "Νέα ανακοίνωση", url: "/t", tag: "announcement" }) : null,
  ]);
  redirect("/admin/announcements?ok=1");
}

async function remove(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.announcement.delete({ where: { id: String(formData.get("id")) } });
  redirect("/admin/announcements");
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const [items, members, staff] = await Promise.all([
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { acks: true } } } }),
    prisma.user.count({ where: { role: "MEMBER", active: true } }),
    prisma.user.count({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true } }),
  ]);
  const reach = { MEMBERS: members, STAFF: staff - 1, ALL: members + staff - 1 };
  const now = new Date();

  return (
    <>
      <h1>Ανακοινώσεις</h1>
      <p className="muted">
        Εμφανίζονται πρώτες στην αρχική μέχρι να πατηθεί «Εντάξει» ή να λήξουν. Στο κινητό πηγαίνει μόνο «Νέα ανακοίνωση»,
        χωρίς το κείμενο.
      </p>
      {sp.ok && <div className="notice">Στάλθηκε ✓</div>}
      <form action={publish} className="card">
        <div className="field">
          <label htmlFor="audience">Προς</label>
          <select id="audience" name="audience" defaultValue="MEMBERS">
            {Object.entries(AUDIENCE).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="title">Τίτλος</label>
          <input id="title" name="title" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="body">Κείμενο</label>
          <textarea id="body" name="body" maxLength={5000} />
        </div>
        <div className="field">
          <label htmlFor="expires">Λήγει (προαιρετικό)</label>
          <input id="expires" name="expires" type="date" min={localParts(now).date} />
        </div>
        <button className="primary" type="submit">Αποστολή</button>
      </form>

      {items.length > 0 && (
        <table>
          <thead>
            <tr><th>Ημερομηνία</th><th>Προς</th><th>Τίτλος</th><th>Το είδαν</th><th>Λήξη</th><th /></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className={a.expiresAt && a.expiresAt < now ? "muted" : undefined}>
                <td>{formatDate(localParts(a.createdAt).date)}</td>
                <td>{AUDIENCE[a.audience]}</td>
                <td>{a.title}</td>
                <td>{a._count.acks}/{Math.max(reach[a.audience], 0)}</td>
                <td>{a.expiresAt ? formatDate(localParts(a.expiresAt).date) : "—"}</td>
                <td>
                  <form action={remove}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" style={{ padding: "4px 8px" }}>Διαγραφή</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
