import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts } from "@/lib/time";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["DAILY_TEXT", "FORM"]),
  title: z.string().trim().min(1),
  body: z.string().default(""),
  url: z.string().trim().url().or(z.literal("")).transform((v) => v || null),
});

async function add(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.content.create({ data: schema.parse(Object.fromEntries(formData)) });
  redirect("/admin/content?ok=1");
}

async function remove(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.content.delete({ where: { id: String(formData.get("id")) } });
  redirect("/admin/content");
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp, s] = await Promise.all([searchParams, getSettings()]);
  const today = localParts(new Date()).date;
  const items = await prisma.content.findMany({
    where: { date: { gte: addDays(today, -7) } },
    orderBy: [{ date: "asc" }, { kind: "asc" }],
  });
  return (
    <>
      <h1>Κείμενα και φόρμες</h1>
      <p className="muted">
        Το κείμενο της ημέρας εμφανίζεται στις {s.dailyTextTime}, οι φόρμες στις {s.formsTime}. Μπορείς να τα ετοιμάσεις από πριν.
      </p>
      {sp.ok && <div className="notice">Προστέθηκε ✓</div>}
      <form action={add} className="card">
        <div className="grid2">
          <div className="field"><label>Μέρα</label><input name="date" type="date" defaultValue={today} required /></div>
          <div className="field">
            <label>Είδος</label>
            <select name="kind">
              <option value="DAILY_TEXT">Κείμενο της ημέρας</option>
              <option value="FORM">Φόρμα της θεματικής</option>
            </select>
          </div>
          <div className="field"><label>Τίτλος</label><input name="title" required /></div>
          <div className="field"><label>Σύνδεσμος φόρμας (προαιρετικό)</label><input name="url" type="url" /></div>
        </div>
        <div className="field"><label>Κείμενο</label><textarea name="body" /></div>
        <button className="primary" type="submit">Προσθήκη</button>
      </form>
      <div className="card table-wrap">
        <table>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.date)}</td>
                <td>{c.kind === "DAILY_TEXT" ? "Κείμενο" : "Φόρμα"}</td>
                <td>{c.title}</td>
                <td>
                  <form action={remove}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" style={{ padding: "6px 10px" }}>Διαγραφή</button>
                  </form>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="muted">Τίποτα ακόμα.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
