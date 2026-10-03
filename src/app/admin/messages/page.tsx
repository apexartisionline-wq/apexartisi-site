import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { messageForMember } from "@/lib/monthly";
import { notifyMembers } from "@/lib/notify";
import { quietUntil } from "@/lib/quiet";
import { formatWhen } from "@/lib/time";

async function saveOnly(formData: FormData) {
  "use server";
  await act(formData, false);
}

async function saveAndSend(formData: FormData) {
  "use server";
  await act(formData, true);
}

async function act(formData: FormData, send: boolean) {
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const text = z.string().trim().min(1).max(4000).parse(String(formData.get("text") ?? ""));
  const msg = await prisma.monthlyMessage.findUniqueOrThrow({ where: { id } });
  if (msg.sentAt) redirect("/admin/messages");
  await prisma.monthlyMessage.update({
    where: { id },
    data: { text: enc(text), editedById: admin.id, ...(send ? { sentAt: new Date(), sentById: admin.id } : {}) },
  });
  await logAccess(admin.id, msg.memberId, send ? "monthly_message_send" : "monthly_message_edit");
  if (send) await notifyMembers([msg.memberId], { title: "Ένα μήνυμα από την ομάδα σου", body: "Από την ομάδα του APEX", url: "/m/message", tag: "monthly" });
  redirect(`/admin/messages?${send ? `sent=${quietUntil() ? "later" : "1"}` : "saved=1"}`);
}

// Μηνύματα ενθάρρυνσης στο τέλος του «μήνα» (κύκλου): σχέδιο από τα νούμερα, τα ελέγχει η υπεύθυνη
// και πατά «Αποστολή». Μόνο θετικό πρόσημο.
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ sent?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const msgs = (await Promise.all(members.map(async (m) => ({ m, msg: await messageForMember(m) })))).filter((x) => x.msg);
  const pending = msgs.filter((x) => !x.msg!.sentAt);
  const sent = msgs.filter((x) => x.msg!.sentAt);
  return (
    <>
      <h1>Μηνύματα μήνα</h1>
      <p className="muted">Στο τέλος κάθε κύκλου, ένα μήνυμα ενθάρρυνσης για κάθε μέλος. Το σχέδιο βγαίνει από τα νούμερα· άλλαξέ το όπως θέλεις και πάτα «Αποστολή».</p>
      {sp.sent === "1" && <div className="notice">Στάλθηκε ✓ Το μέλος το βλέπει στο app και πήρε ειδοποίηση.</div>}
      {sp.sent === "later" && <div className="notice">Στάλθηκε ✓ Το μέλος το βλέπει ήδη στο app· η ειδοποίηση στο κινητό θα φύγει στις 08:00 (τίποτα μετά τις 22:00).</div>}
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓ (δεν στάλθηκε ακόμα)</div>}
      <h2>Περιμένουν έλεγχο ({pending.length})</h2>
      {pending.length === 0 && <div className="card muted">Τίποτα.</div>}
      {pending.map(({ m, msg }) => (
        <form key={msg!.id} action={saveOnly} className="card">
          <input type="hidden" name="id" value={msg!.id} />
          <div className="row spread"><strong>{m.name}</strong><Link className="small" href={`/t/members/${m.id}/cycle`}>Ανασκόπηση ›</Link></div>
          <textarea name="text" defaultValue={msg!.text} style={{ minHeight: 260, marginTop: 8 }} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="submit">Αποθήκευση</button>
            <button type="submit" formAction={saveAndSend} className="primary">Αποστολή</button>
          </div>
        </form>
      ))}
      {sent.length > 0 && (
        <>
          <h2>Στάλθηκαν</h2>
          <div className="list">
            {sent.map(({ m, msg }) => (
              <div key={msg!.id} style={{ display: "block" }}>
                <div className="title">{m.name}</div>
                <div className="sub">Στάλθηκε {formatWhen(msg!.sentAt!)}{msg!.readAt ? ` · το διάβασε ${formatWhen(msg!.readAt)}` : " · δεν το έχει ανοίξει"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
