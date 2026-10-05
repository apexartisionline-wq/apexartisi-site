import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { formatWhen } from "@/lib/time";
import { prisma } from "@/lib/db";
import { caseHistory, saveCase } from "@/lib/handover";
import { CASE_FIELDS } from "@/lib/handover-rules";

async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const id = String(formData.get("memberId"));
  if (!(await prisma.user.findFirst({ where: { id, role: "MEMBER" } }))) notFound();
  await saveCase(id, formData, user.id);
  await logAccess(user.id, id, "case_summary_edit");
  redirect(`/t/members/${id}?case=1`);
}

// Σύνοψη περίπτωσης: την κρατούν οι θεραπευτές. Κάθε αποθήκευση είναι νέα έκδοση.
export default async function CaseSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" } });
  if (!member) notFound();
  await logAccess(user.id, id, "case_summary_view");
  const history = await caseHistory(id);
  const current = history[0]?.data ?? {};
  return (
    <main>
      <p className="small"><Link className="back" href={`/t/members/${id}`}>‹ {member.name}</Link></p>
      <h1>Σύνοψη περίπτωσης</h1>
      <p className="muted small">
        Λίγες γραμμές, ώστε όποιος θεραπευτής αναλάβει να ξέρει πού βρίσκεται το μέλος. Τα σήματα ασφαλείας
        (κίνδυνος, κόκκινο κουμπί, χρήση) φαίνονται αυτόματα στην καρτέλα και δεν χρειάζεται να γραφτούν εδώ.
      </p>
      <form action={save} className="card">
        <input type="hidden" name="memberId" value={id} />
        {CASE_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={f.key}>{f.label}</label>
            <textarea id={f.key} name={f.key} defaultValue={current[f.key] ?? ""} placeholder={f.hint} style={{ minHeight: 70 }} />
          </div>
        ))}
        <button className="primary" type="submit">Αποθήκευση</button>
      </form>
      {history.length > 1 && (
        <>
          <h2>Προηγούμενες εκδόσεις</h2>
          {history.slice(1).map((v) => (
            <details className="card small" key={v.id}>
              <summary>{formatWhen(v.at)} · {v.author}</summary>
              {CASE_FIELDS.filter((f) => v.data[f.key]).map((f) => (
                <div key={f.key} style={{ marginTop: 8 }}>
                  <div className="muted">{f.label}</div>
                  <div className="body-text">{v.data[f.key]}</div>
                </div>
              ))}
            </details>
          ))}
        </>
      )}
    </main>
  );
}
