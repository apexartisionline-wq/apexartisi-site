import { prisma } from "@/lib/db";

const ACTION: Record<string, string> = {
  member_file_view: "άνοιξε φάκελο",
  session_view: "άνοιξε συνεδρία/σημείωμα",
  safety_plan_view: "άνοιξε πλάνο ασφάλειας",
  safety_plan_edit: "άλλαξε πλάνο ασφάλειας",
  help_view: "άνοιξε κόκκινο κουμπί",
  journal_view: "άνοιξε ημερολόγιο",
};

// Καταγραφή πρόσβασης: ποιος άνοιξε ποιον φάκελο και πότε (μέτρο ασφάλειας §18 Α5).
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const sp = await searchParams;
  const rows = await prisma.accessLog.findMany({ where: sp.member ? { memberId: sp.member } : {}, orderBy: { at: "desc" }, take: 300 });
  const ids = [...new Set(rows.flatMap((r) => [r.userId, r.memberId].filter(Boolean) as string[]))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <h1>Καταγραφή πρόσβασης</h1>
      <p className="muted small">Οι τελευταίες 300 ενέργειες. Για έναν άνθρωπο: από τον φάκελό του.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Πότε</th><th>Ποιος</th><th>Τι</th><th>Μέλος</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{r.at.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" })}</td>
                <td>{names.get(r.userId) ?? "—"}</td>
                <td>{ACTION[r.action] ?? r.action}</td>
                <td>{r.memberId ? names.get(r.memberId) ?? "—" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
