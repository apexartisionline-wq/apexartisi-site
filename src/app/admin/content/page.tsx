import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts } from "@/lib/time";
import { questionsFromLines, parseQuestions } from "@/lib/theme-forms";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["DAILY_TEXT", "FORM"]),
  title: z.string().trim().min(1),
  body: z.string().default(""),
  url: z.string().trim().url().or(z.literal("")).transform((v) => v || null),
  questions: z.string().default(""),
});

// Εικόνα του κειμένου της ημέρας (κάρτα κινήτρων): ως 5 MB, μόνο εικόνα.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

async function add(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const { date, kind, title, body, url, questions } = schema.parse({ date: formData.get("date"), kind: formData.get("kind"), title: formData.get("title"), body: formData.get("body") ?? "", url: formData.get("url") ?? "", questions: formData.get("questions") ?? "" });
  const file = formData.get("image");
  let imageMime: string | null = null, image: Uint8Array<ArrayBuffer> | null = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) redirect("/admin/content?e=type");
    if (file.size > IMAGE_MAX_BYTES) redirect("/admin/content?e=size");
    imageMime = file.type;
    image = new Uint8Array(await file.arrayBuffer());
  }
  // Φόρμα μέσα στο Apex (22/10): ερωτήσεις μία σε κάθε γραμμή· τότε ο σύνδεσμος δεν χρειάζεται.
  const qs = kind === "FORM" ? questionsFromLines(questions) : "";
  await prisma.content.create({ data: { date, kind, title, body, url: qs ? null : url, questions: qs, imageMime, image } });
  redirect("/admin/content?ok=1");
}

async function remove(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  // Φόρμα με απαντήσεις μελών δεν σβήνεται (οι απαντήσεις είναι κλινικός φάκελος, σβήνονται μόνο με τον χρόνο τήρησης).
  if (await prisma.formAnswer.count({ where: { contentId: id } })) redirect("/admin/content?e=answered");
  await prisma.content.delete({ where: { id } });
  redirect("/admin/content");
}

const ERR: Record<string, string> = { type: "Η εικόνα πρέπει να είναι αρχείο εικόνας (JPG, PNG…).", size: "Η εικόνα είναι πάνω από 5 MB.", answered: "Η φόρμα έχει ήδη απαντήσεις μελών — δεν σβήνεται." };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const [sp, s] = await Promise.all([searchParams, getSettings()]);
  const today = localParts(new Date()).date;
  const items = await prisma.content.findMany({
    omit: { image: true },
    where: { date: { gte: addDays(today, -7) } },
    orderBy: [{ date: "asc" }, { kind: "asc" }],
  });
  // Ποιοι απάντησαν σε κάθε φόρμα μέσα στο Apex (μόνο ονόματα· τις απαντήσεις τις βλέπει κανείς στον φάκελο του μέλους).
  const answered = await prisma.formAnswer.findMany({
    where: { contentId: { in: items.filter((c) => c.questions).map((c) => c.id) } },
    distinct: ["contentId", "memberId"],
    select: { contentId: true, member: { select: { id: true, name: true } } },
  });
  const whoAnswered = new Map<string, { id: string; name: string }[]>();
  for (const a of answered) whoAnswered.set(a.contentId, [...(whoAnswered.get(a.contentId) ?? []), a.member]);
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
          <li><strong>Φόρμες της θεματικής (μέσα στο Apex, από 22/10):</strong> εδώ, είδος «Φόρμα της θεματικής», το κείμενο και οι <strong>ερωτήσεις μία σε κάθε γραμμή</strong> — το μέλος απαντά μέσα στο Apex και ξαναβλέπει τις απαντήσεις του στη «Βιβλιοθήκη θεματικών»· η ομάδα τις βλέπει στον φάκελο («Εργασίες»). Βγαίνουν στις {s.formsTime}, τις μέρες των φορμών. Συνήθως η θεματική της εβδομάδας μπαίνει έτοιμη από αρχείο (βλ. docs/odigies/thematiki-sto-apex.md). Παλιές φόρμες με σύνδεσμο Google μένουν όπως ήταν.</li>
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
          <div className="field"><label>Σύνδεσμος φόρμας Google (μόνο για παλιές φόρμες· όχι αν γράψεις ερωτήσεις)</label><input name="url" type="url" /></div>
        </div>
        <div className="field"><label>Κείμενο</label><textarea name="body" /></div>
        <div className="field">
          <label htmlFor="questions">Ερωτήσεις της φόρμας — μία σε κάθε γραμμή (μόνο για «Φόρμα της θεματικής»)</label>
          <textarea id="questions" name="questions" rows={5} placeholder={"Τι σημαίνει για μένα ένα όριο;\nΠού δυσκολεύομαι να το βάλω;"} />
        </div>
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
                <td>{c.kind === "DAILY_TEXT" ? "Κείμενο" : c.questions ? "Φόρμα (Apex)" : "Φόρμα (σύνδεσμος)"}</td>
                <td>
                  {c.title}{c.imageMime && <> <span className="badge">εικόνα</span></>}
                  {c.questions && (
                    <div className="small muted">
                      {parseQuestions(c.questions).length} ερωτήσεις · απάντησαν {whoAnswered.get(c.id)?.length ?? 0}
                      {whoAnswered.get(c.id)?.length ? `: ${whoAnswered.get(c.id)!.map((m) => m.name).join(", ")}` : ""}
                    </div>
                  )}
                </td>
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
