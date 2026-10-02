import { vocative } from "@/lib/vocative";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { dec, enc } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { CLOSURE_HOW, doorOpenMessage } from "@/lib/incident";
import { notifyUsers } from "@/lib/notify";
import { formatDate, formatWhen, localParts } from "@/lib/time";

async function save(formData: FormData, send: boolean) {
  const admin = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const t = (k: string, max: number) => z.string().trim().max(max).parse(String(formData.get(k) ?? ""));
  const how = z.enum(["COMPLETED", "STOPPED", "LOST"]).safeParse(formData.get("how"));
  if (!how.success) redirect(`/admin/people/${memberId}/close?error=1`);
  await prisma.closure.create({
    data: { memberId, how: how.data, data: enc(JSON.stringify({ keeps: t("keeps", 1500), referral: t("referral", 500) })), message: enc(t("message", 4000)), authorId: admin.id, sentAt: send ? new Date() : null },
  });
  await logAccess(admin.id, memberId, send ? "closure_send" : "closure_save");
  if (send) await notifyUsers([memberId], { title: "Ένα μήνυμα από την ομάδα σου", url: "/m/message", tag: "closure" });
  redirect(`/admin/people/${memberId}/close?saved=1`);
}
async function saveOnly(fd: FormData) { "use server"; await save(fd, false); }
async function saveAndSend(fd: FormData) { "use server"; await save(fd, true); }

// Ολοκλήρωση συνεργασίας (09): η εφαρμογή δείχνει όλους τους μήνες, η Εύα γράφει 3 γραμμές
// και στέλνει (αφού το ελέγξει) ένα ζεστό «η πόρτα είναι ανοιχτή».
export default async function ClosePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("ADMIN");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const member = await prisma.user.findFirst({ where: { id, role: "MEMBER" }, select: { id: true, name: true, soberSince: true } });
  if (!member) notFound();
  const [months, last, groups, journal] = await Promise.all([
    prisma.cycle.findMany({ where: { memberId: id }, orderBy: { startedAt: "asc" }, select: { id: true, startedAt: true } }),
    prisma.closure.findFirst({ where: { memberId: id }, orderBy: { createdAt: "desc" } }),
    prisma.attendance.count({ where: { memberId: id } }),
    prisma.journalEntry.count({ where: { memberId: id } }),
  ]);
  const sessions = await prisma.booking.count({ where: { memberId: id, joinedAt: { not: null } } });
  const lastData = last ? (JSON.parse(dec(last.data)) as { keeps: string; referral: string }) : null;
  return (
    <>
      <p><Link href={`/admin/people/${id}`}>‹ {member.name}</Link></p>
      <h1>Ολοκλήρωση συνεργασίας</h1>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓{last?.sentAt && " Το μήνυμα στάλθηκε στο μέλος."}</div>}
      {sp.error && <div className="error">Διάλεξε πώς έκλεισε.</div>}
      <div className="card small stack">
        <div>Μήνες: <strong>{months.length}</strong> · Ατομικές: <strong>{sessions}</strong> · Ομάδες: <strong>{groups}</strong> · Απογραφές: <strong>{journal}</strong></div>
        <div className="list">{months.map((c, i) => <Link key={c.id} href={`/t/members/${id}/month/${c.id}`}><span>Μήνας {i + 1} · από {formatDate(localParts(c.startedAt).date)}</span></Link>)}</div>
      </div>
      {last && (
        <div className="card small">
          <strong>Τελευταία καταγραφή:</strong> {CLOSURE_HOW[last.how as keyof typeof CLOSURE_HOW]} · {formatWhen(last.createdAt)}{last.sentAt ? " · μήνυμα στάλθηκε" : " · μήνυμα δεν στάλθηκε"}
          {lastData?.keeps && <div><span className="muted">Τι κρατάει:</span> {lastData.keeps}</div>}
          {lastData?.referral && <div><span className="muted">Παραπομπή:</span> {lastData.referral}</div>}
        </div>
      )}
      <form action={saveOnly} className="card">
        <input type="hidden" name="memberId" value={id} />
        <div className="field">
          <label>Πώς έκλεισε</label>
          {Object.entries(CLOSURE_HOW).map(([k, v]) => <label key={k} className="row" style={{ gap: 8, fontWeight: 400 }}><input type="radio" name="how" value={k} required style={{ width: "auto" }} /> {v}</label>)}
        </div>
        <div className="field"><label htmlFor="keeps">Τι κρατάει (λίγες γραμμές)</label><textarea id="keeps" name="keeps" style={{ minHeight: 70 }} /></div>
        <div className="field"><label htmlFor="referral">Παραπομπή <span className="muted small">· αν υπάρχει (πού, γιατί)</span></label><input id="referral" name="referral" /></div>
        <div className="field"><label htmlFor="message">Μήνυμα στο μέλος <span className="muted small">· ελέγξ' το πριν φύγει</span></label>
          <textarea id="message" name="message" defaultValue={doorOpenMessage(vocative(member.name.split(" ")[0]), months.length)} style={{ minHeight: 200 }} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="submit">Αποθήκευση χωρίς αποστολή</button>
          <button type="submit" formAction={saveAndSend} className="primary">Αποθήκευση και αποστολή</button>
        </div>
      </form>
    </>
  );
}
