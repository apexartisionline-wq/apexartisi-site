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

// Εικόνα του κειμένου της ημέρας (κάρτα κινήτρων): ως 5 MB, μόνο εικόνα.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

async function add(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const { date, kind, title, body, url } = schema.parse({ date: formData.get("date"), kind: formData.get("kind"), title: formData.get("title"), body: formData.get("body") ?? "", url: formData.get("url") ?? "" });
  const file = formData.get("image");
  let imageMime: string | null = null, image: Uint8Array<ArrayBuffer> | null = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) redirect("/admin/content?e=type");
    if (file.size > IMAGE_MAX_BYTES) redirect("/admin/content?e=size");
    imageMime = file.type;
    image = new Uint8Array(await file.arrayBuffer());
  }
  await prisma.content.create({ data: { date, kind, title, body, url, imageMime, image } });
  redirect("/admin/content?ok=1");
}

async function remove(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.content.delete({ where: { id: String(formData.get("id")) } });
  redirect("/admin/content");
}

const ERR: Record<string, string> = { type: "Η εικόνα πρέπει να είναι αρχείο εικόνας (JPG, PNG…).", size: "Η εικόνα είναι πάνω από 5 MB." };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const [sp, s] = await Promise.all([searchParams, getSettings()]);
  const today = localParts(new Date()).date;
  const items = await prisma.content.findMany({
    omit: { image: true },
    where: { date: { gte: addDays(today, -7) } },
    orderBy: [{ date: "asc" }, { kind: "asc" }],
  });
  return (
    <>
      <h1>Κείμενα και φόρμες</h1>
      <p className="muted">
        Το κείμενο της ημέρας εμφανίζεται στις {s.dailyTextTime}, οι φόρμες στις {s.formsTime}. Μπορείς να τα ετοιμάσεις από πριν.
      </p>
      <details className="card small" data-tour="how-to-send">
        <summary><strong>Πώς στέλνω κάτι στα μέλη</strong> — κάρτα του πρωινού, κείμενο, φόρμα, αρχείο, ανακοίνωση</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li><strong>Κάρτα κινήτρων / «Καθημερινή σκέψη» κάθε πρωί:</strong> εδώ, είδος «Κείμενο της ημέρας», μέρα, τίτλος, προαιρετικό κείμενο και <strong>εικόνα</strong>. Βγαίνει μόνη της στις {s.dailyTextTime} στο «Σήμερα» του μέλους (και στο «Υλικό» των θεραπευτών). Μπορείς να ανεβάσεις από πριν όλες τις μέρες της εβδομάδας.</li>
          <li><strong>Φόρμες της θεματικής:</strong> εδώ, είδος «Φόρμα της θεματικής» με τον σύνδεσμο της φόρμας· βγαίνουν στις {s.formsTime}, τις μέρες των φορμών. Ο τίτλος «Θέμα: …» δίνει το όνομα της θεματικής στις ατομικές.</li>
          <li><strong>Υλικό για όλους (PDF, ήχος, βίντεο, εικόνα):</strong> «Βιβλιοθήκη» — μένει μόνιμα, το μέλος το βλέπει στη δική του «Βιβλιοθήκη» μόνο μέσα στο Apex.</li>
          <li><strong>Βήματα και εργασίες σε συγκεκριμένο μέλος:</strong> «Βήματα» (ή από την καρτέλα του μέλους → «Εργασίες»).</li>
          <li><strong>Μήνυμα σε όλους τώρα, με ειδοποίηση:</strong> «Ανακοινώσεις» (με ημερομηνία λήξης).</li>
          <li><strong>Μήνυμα σε ένα μέλος:</strong> «Μηνύματα μήνα» (στο κλείσιμο του μήνα) ή «Ολοκλήρωση συνεργασίας».</li>
        </ul>
      </details>
      {sp.ok && <div className="notice">Προστέθηκε ✓</div>}
      {sp.e && <div className="error">{ERR[sp.e] ?? "Κάτι πήγε στραβά."}</div>}
      <form action={add} className="card" encType="multipart/form-data">
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
        <div className="field">
          <label htmlFor="image">Εικόνα (προαιρετικό — π.χ. η κάρτα του πρωινού, JPG/PNG ως 5 MB)</label>
          <input id="image" name="image" type="file" accept="image/*" />
        </div>
        <button className="primary" type="submit">Προσθήκη</button>
      </form>
      <div className="card table-wrap">
        <table>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.date)}</td>
                <td>{c.kind === "DAILY_TEXT" ? "Κείμενο" : "Φόρμα"}</td>
                <td>{c.title}{c.imageMime && <> <span className="badge">εικόνα</span></>}</td>
                <td>{c.imageMime && <img src={`/api/content/${c.id}/image`} alt="" style={{ height: 44, borderRadius: 6 }} />}</td>
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
