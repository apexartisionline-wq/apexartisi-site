import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, formatDate, localParts } from "@/lib/time";

// Εφημερίες: ποιος καλύπτει κάθε νύχτα (18:00–09:00). Η ειδοποίησή του περνά το αθόρυβο.
async function save(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("n_")) continue;
    const date = k.slice(2);
    if (v) await prisma.onCall.upsert({ where: { date }, create: { date, userId: String(v) }, update: { userId: String(v) } });
    else await prisma.onCall.deleteMany({ where: { date } });
  }
  redirect("/admin/oncall?ok=1");
}

export default async function OnCallPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const today = localParts(new Date()).date;
  const nights = Array.from({ length: 21 }, (_, i) => addDays(today, i));
  const [staff, rows] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.onCall.findMany({ where: { date: { gte: today } } }),
  ]);
  const by = new Map(rows.map((r) => [r.date, r.userId]));
  const count = new Map<string, number>();
  rows.forEach((r) => count.set(r.userId, (count.get(r.userId) ?? 0) + 1));
  return (
    <>
      <h1>Εφημερίες</h1>
      <p className="muted small">
        Η νύχτα ξεκινά στις 18:00 και τελειώνει στις 09:00 της επόμενης. Αν δεν αναλάβει κανείς σε 10′, το κόκκινο κουμπί πάει
        στον εφημερεύοντα και σε εσάς. Προτείνεται όριο εφημεριών ανά άτομο και ρεπό την επόμενη μέρα.
      </p>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      <form action={save} className="card table-wrap">
        <table>
          <tbody>
            {nights.map((d) => (
              <tr key={d}>
                <td>{formatDate(d)}</td>
                <td>
                  <select name={`n_${d}`} defaultValue={by.get(d) ?? ""}>
                    <option value="">— κανείς</option>
                    {staff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="primary" type="submit" style={{ marginTop: 12 }}>Αποθήκευση</button>
      </form>
      <div className="card small">
        <strong>Εφημερίες ανά άτομο (επόμενες 3 εβδομάδες):</strong>{" "}
        {staff.map((t) => `${t.name}: ${count.get(t.id) ?? 0}`).join(" · ")}
      </div>
    </>
  );
}
