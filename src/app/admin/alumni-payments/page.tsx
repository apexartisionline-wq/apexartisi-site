import Link from "next/link";
import { redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, formatDate, formatWhen, localParts } from "@/lib/time";

async function togglePaid(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const paid = formData.get("paid") === "1";
  const b = await prisma.booking.findUnique({ where: { id }, select: { memberId: true, cycleId: true, member: { select: { alumniSince: true } } } });
  // Μόνο ατομικές αποφοίτων (χωρίς κύκλο)· οι ατομικές του προγράμματος πάνε με τον κύκλο.
  if (b && !b.cycleId && b.member.alumniSince) {
    await prisma.booking.update({ where: { id }, data: { paidAt: paid ? new Date() : null } });
    await logAccess(admin.id, b.memberId, paid ? "alumni_paid" : "alumni_unpaid");
  }
  redirect("/admin/alumni-payments");
}

// Πληρωμές αποφοίτων (υπεύθυνη 25/10): ο απόφοιτος χρεώνεται ανά ατομική. Η πληρωμή γίνεται εκτός Apex· εδώ η διαχείριση
// σημειώνει «Πληρώθηκε». Οι ομάδες των αποφοίτων είναι δωρεάν και δεν εμφανίζονται.
export default async function AlumniPaymentsPage() {
  await requireRole("ADMIN");
  const today = localParts(new Date()).date;
  const rows = (
    await prisma.booking.findMany({
      where: { cycleId: null, member: { role: "MEMBER", alumniSince: { not: null } }, slot: { kind: "INDIVIDUAL", date: { gte: addDays(today, -180) } } },
      include: { member: { select: { id: true, name: true, alumniSince: true } }, slot: { select: { date: true, hour: true, startsAt: true, therapist: { select: { name: true } } } } },
      orderBy: { slot: { startsAt: "desc" } },
    })
  ).filter((b) => b.slot.date >= (b.member.alumniSince ?? ""));
  const now = new Date();
  const unpaidPast = rows.filter((b) => !b.paidAt && b.slot.startsAt <= now && b.confirmedCame !== false).length;
  const came = (b: (typeof rows)[number]) =>
    b.slot.startsAt > now ? <span className="muted">θα γίνει</span> : b.confirmedCame === true ? "ήρθε" : b.confirmedCame === false ? "δεν ήρθε" : b.joinedAt ? "μπήκε" : <span className="muted">χωρίς σημείωμα</span>;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", alumniSince: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, alumniSince: true } });

  return (
    <>
      <h1>Πληρωμές αποφοίτων</h1>
      <p className="muted">
        Οι απόφοιτοι έρχονται στις ομάδες δωρεάν και πληρώνουν κάθε ατομική χωριστά. Η πληρωμή γίνεται εκτός Apex·
        εδώ σημειώνετε «Πληρώθηκε». Απόφοιτος γίνεται κάποιος από την καρτέλα του στα «Άνθρωποι».
      </p>
      {members.length > 0 ? (
        <p className="small">
          Απόφοιτοι: {members.map((m, i) => <span key={m.id}>{i > 0 && " · "}<Link href={`/admin/people/${m.id}`}>{m.name}</Link></span>)}
        </p>
      ) : (
        <div className="card muted">Δεν υπάρχει ακόμα απόφοιτος.</div>
      )}
      {unpaidPast > 0 && <div className="notice">Χωρίς πληρωμή: {unpaidPast} {unpaidPast === 1 ? "ατομική που έγινε" : "ατομικές που έγιναν"}.</div>}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Πότε</th><th>Απόφοιτος</th><th>Θεραπευτής</th><th>Παρουσία</th><th>Πληρωμή</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{formatDate(b.slot.date)} · {String(b.slot.hour).padStart(2, "0")}:00</td>
                  <td><Link href={`/admin/people/${b.member.id}`}>{b.member.name}</Link></td>
                  <td>{b.slot.therapist?.name ?? "—"}</td>
                  <td>{came(b)}</td>
                  <td>
                    <form action={togglePaid} className="row" style={{ gap: 8 }}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="paid" value={b.paidAt ? "0" : "1"} />
                      {b.paidAt ? (
                        <>
                          <span className="badge ok">Πληρώθηκε ✓</span>
                          <span className="small muted">{formatWhen(b.paidAt)}</span>
                          <button type="submit" className="small">Αναίρεση</button>
                        </>
                      ) : (
                        <button type="submit">Πληρώθηκε</button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        members.length > 0 && <div className="card muted">Καμία ατομική αποφοίτου τους τελευταίους 6 μήνες.</div>
      )}
    </>
  );
}
