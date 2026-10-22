import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { quietUntil } from "@/lib/quiet";
import { sendTeamMessage, TEAM_MESSAGE_MAX } from "@/lib/team-messages";
import { formatWhen } from "@/lib/time";

async function send(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const text = z.string().trim().min(1).max(TEAM_MESSAGE_MAX).safeParse(String(formData.get("text") ?? ""));
  if (!text.success) redirect("/admin/team-messages?e=text");
  const all = formData.get("all") === "on";
  const picked = formData.getAll("to").map(String);
  const ids = all ? (await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true } })).map((m) => m.id) : picked;
  if (ids.length === 0) redirect("/admin/team-messages?e=to");
  const r = await sendTeamMessage(ids, text.data, { sentById: admin.id, host: (await headers()).get("host") });
  for (const id of ids) await logAccess(admin.id, id, "team_message_send");
  redirect(`/admin/team-messages?sent=${r.sent}&mail=${r.emailed}&fail=${r.emailFailed}${quietUntil() ? "&later=1" : ""}`);
}

// Μήνυμα της διαχείρισης προς ένα ή πολλά μέλη (υπεύθυνη 22/10). Μόνο προς το μέλος, χωρίς απάντηση· κάθε μέλος το βλέπει
// σαν προσωπικό στο «Από την ομάδα σου», με ειδοποίηση και ουδέτερο email (χωρίς το κείμενο).
export default async function TeamMessagesPage({ searchParams }: { searchParams: Promise<{ sent?: string; mail?: string; fail?: string; later?: string; e?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const [members, recent] = await Promise.all([
    prisma.user.findMany({ where: { role: "MEMBER", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.teamMessage.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { member: { select: { name: true } } } }),
  ]);
  return (
    <>
      <h1>Μήνυμα σε μέλη</h1>
      <p className="muted">
        Το μέλος το βλέπει στο «Από την ομάδα σου» και παίρνει ειδοποίηση «Ένα μήνυμα από την ομάδα σου». Του φεύγει και email,
        <strong> χωρίς το κείμενο</strong>, μόνο ότι έχει μήνυμα στο Apex. Δεν απαντά από εκεί· για ό,τι επείγει έχει το κόκκινο κουμπί.
        Όταν στέλνετε σε πολλά μέλη, το καθένα το βλέπει σαν δικό του, χωρίς να ξέρει σε ποιους άλλους πήγε.
      </p>
      {!mailConfigured() && <div className="notice">Το email δεν είναι ρυθμισμένο εδώ: φεύγουν μόνο το μήνυμα στο Apex και η ειδοποίηση.</div>}
      {sp.sent && (
        <div className="notice">
          Στάλθηκε σε {sp.sent} {sp.sent === "1" ? "μέλος" : "μέλη"} ✓{Number(sp.mail) > 0 && ` · email σε ${sp.mail}`}
          {Number(sp.fail) > 0 && ` · το email απέτυχε σε ${sp.fail}`}
          {sp.later && " · η ειδοποίηση στο κινητό φεύγει το πρωί (ώρες ησυχίας)"}
        </div>
      )}
      {sp.e === "to" && <div className="notice">Διάλεξε τουλάχιστον ένα μέλος.</div>}
      {sp.e === "text" && <div className="notice">Γράψε το μήνυμα.</div>}

      <form action={send} className="card">
        <div className="field">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Προς</div>
          <label className="tm-pick" style={{ fontWeight: 600 }}>
            <input type="checkbox" name="all" /> <span>Όλα τα μέλη ({members.length})</span>
          </label>
          <div className="tm-members">
            {members.map((m) => (
              <label key={m.id} className="tm-pick">
                <input type="checkbox" name="to" value={m.id} /> <span>{m.name}{!m.email && <span className="muted small"> · χωρίς email</span>}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="text">Μήνυμα</label>
          <textarea id="text" name="text" required maxLength={TEAM_MESSAGE_MAX} style={{ minHeight: 140 }} />
        </div>
        <button className="primary" type="submit">Αποστολή</button>
      </form>

      {recent.length > 0 && (
        <table>
          <thead>
            <tr><th>Πότε</th><th>Προς</th><th>Μήνυμα</th><th>Email</th><th>Το διάβασε</th></tr>
          </thead>
          <tbody>
            {recent.map((m) => {
              const t = dec(m.text);
              return (
                <tr key={m.id}>
                  <td>{formatWhen(m.createdAt)}</td>
                  <td>{m.member.name}</td>
                  <td>{m.kind === "cycle_done" && <span className="muted">Ολοκλήρωση κύκλου · </span>}{t.length > 90 ? `${t.slice(0, 90)}…` : t}</td>
                  <td>{m.emailedAt ? "✓" : "—"}</td>
                  <td>{m.readAt ? `✓ ${formatWhen(m.readAt)}` : "όχι ακόμα"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
