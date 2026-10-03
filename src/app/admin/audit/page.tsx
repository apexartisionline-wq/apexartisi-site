import { prisma } from "@/lib/db";

const ACTION: Record<string, string> = {
  member_file_view: "άνοιξε φάκελο",
  session_view: "άνοιξε συνεδρία/σημείωμα",
  safety_plan_view: "άνοιξε πλάνο ασφάλειας",
  safety_plan_edit: "άλλαξε πλάνο ασφάλειας",
  help_view: "άνοιξε κόκκινο κουμπί",
  journal_view: "άνοιξε ημερολόγιο",
  notes_view: "άνοιξε σημειώματα",
  session_note_save: "έγραψε σημείωμα ατομικής",
  intake_view: "άνοιξε έναρξη συνεργασίας",
  case_summary_view: "άνοιξε σύνοψη",
  case_summary_edit: "άλλαξε σύνοψη",
  assessment_view: "άνοιξε αρχική αξιολόγηση",
  assessment_save: "αποθήκευσε αρχική αξιολόγηση",
  assessment_complete: "ολοκλήρωσε αρχική αξιολόγηση",
  risk_view: "άνοιξε ανάγκες ασφάλειας",
  risk_review_LOW: "αξιολόγησε ανάγκες ασφάλειας: Συνήθεις",
  risk_review_MEDIUM: "αξιολόγησε ανάγκες ασφάλειας: Αυξημένες",
  risk_review_HIGH: "αξιολόγησε ανάγκες ασφάλειας: Υψηλές",
  emergency_reveal: "ΑΝΟΙΞΕ στοιχεία έκτακτης ανάγκης",
  emergency_view: "είδε στοιχεία έκτακτης ανάγκης",
  cycle_review_view: "άνοιξε ανασκόπηση κύκλου",
  cycle_review_save: "έγραψε ανασκόπηση κύκλου",
  month_folder_view: "άνοιξε φάκελο μήνα",
  monthly_message_edit: "άλλαξε μήνυμα μήνα",
  monthly_message_send: "έστειλε μήνυμα μήνα",
  closure_save: "αποθήκευσε ολοκλήρωση συνεργασίας",
  closure_send: "έστειλε μήνυμα ολοκλήρωσης",
  incident_view: "άνοιξε συμβάντα",
  incident_create: "κατέγραψε συμβάν",
  incident_close: "έκλεισε συμβάν",
  dropout_call: "κατέγραψε τηλεφώνημα (χωρίς επαφή)",
  assignment_photo_view: "άνοιξε φωτογραφία εργασίας",
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
