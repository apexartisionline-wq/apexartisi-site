import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureGroupSession, groupDays } from "@/lib/groups";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

const MENTION_ROWS = 4;

function parse(date: string, t: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}$/.test(t)) return null;
  return { date, time: `${t.slice(0, 2)}:${t.slice(2)}` };
}

async function findGroup(date: string, time: string) {
  const s = await getSettings();
  return (await groupDays(date, date, s)).find((g) => g.time === time) ?? null;
}

// Σημείωμα ομάδας: το γράφει ο συντονιστής (ή η Εύα)· το διαβάζουν όλοι οι θεραπευτές.
async function save(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const date = String(formData.get("date"));
  const time = String(formData.get("time"));
  const g = await findGroup(date, time);
  if (!g || (user.role !== "ADMIN" && g.coordinatorId !== user.id)) notFound();
  const session = await ensureGroupSession(date, time);
  const mentions = Array.from({ length: MENTION_ROWS }, (_, i) => ({
    memberId: String(formData.get(`m${i}`) ?? ""),
    text: String(formData.get(`t${i}`) ?? "").trim(),
  })).filter((m) => m.memberId && m.text);
  await prisma.$transaction([
    prisma.groupSession.update({
      where: { id: session.id },
      data: {
        theme: enc(String(formData.get("theme") ?? "").trim().slice(0, 2000)),
        atmosphere: enc(String(formData.get("atmosphere") ?? "").trim().slice(0, 2000)),
        noteById: user.id,
        noteAt: new Date(),
      },
    }),
    prisma.groupMention.deleteMany({ where: { groupSessionId: session.id } }),
    prisma.groupMention.createMany({ data: mentions.map((m) => ({ ...m, text: enc(m.text), groupSessionId: session.id })) }),
  ]);
  redirect(`/t/group/${date}/${time.replace(":", "")}?saved=1`);
}

export default async function GroupNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string; time: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const [p, sp] = await Promise.all([params, searchParams]);
  const key = parse(p.date, p.time);
  if (!key) notFound();
  const g = await findGroup(key.date, key.time);
  if (!g) notFound();

  const [session, coordinator, present] = await Promise.all([
    prisma.groupSession.findUnique({
      where: { date_time: key },
      include: { mentions: { include: { member: { select: { name: true } } } } },
    }),
    g.coordinatorId ? prisma.user.findUnique({ where: { id: g.coordinatorId }, select: { name: true } }) : null,
    prisma.attendance.findMany({ where: { date: key.date }, include: { member: { select: { id: true, name: true } } } }),
  ]);
  const canWrite = user.role === "ADMIN" || g.coordinatorId === user.id;
  const members = await prisma.user.findMany({ where: { role: "MEMBER", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const mentions = session?.mentions ?? [];

  return (
    <main>
      <p className="muted">Ομάδα · {formatDate(key.date)} {key.time} · συντονιστής: {coordinator?.name ?? "—"}</p>
      <h1>Σημείωμα ομάδας</h1>
      <div className="card small">
        <strong>Μπήκαν ({present.length}):</strong>{" "}
        {present.map((a, i) => (
          <span key={a.id}>{i > 0 && ", "}<Link href={`/t/members/${a.member.id}`}>{a.member.name}</Link></span>
        )) }
        {present.length === 0 && <span className="muted">κανείς ακόμα</span>}
      </div>
      {sp.saved && <div className="notice">Αποθηκεύτηκε ✓</div>}

      {canWrite ? (
        <form action={save} className="card">
          <input type="hidden" name="date" value={key.date} />
          <input type="hidden" name="time" value={key.time} />
          <div className="field">
            <label htmlFor="theme"><strong>Θέμα</strong> — τι δουλέψαμε</label>
            <textarea id="theme" name="theme" defaultValue={dec(session?.theme)} style={{ minHeight: 80 }} />
          </div>
          <div className="field">
            <label htmlFor="atmosphere"><strong>Ατμόσφαιρα</strong> — πώς ήταν η ομάδα</label>
            <textarea id="atmosphere" name="atmosphere" defaultValue={dec(session?.atmosphere)} style={{ minHeight: 80 }} />
          </div>
          <label><strong>Προσοχή σε…</strong> — μία γραμμή για όποιο μέλος χρειάζεται (φαίνεται στον φάκελό του)</label>
          {Array.from({ length: MENTION_ROWS }, (_, i) => (
            <div className="row" key={i} style={{ marginBottom: 8, flexWrap: "nowrap" }}>
              <select name={`m${i}`} defaultValue={mentions[i]?.memberId ?? ""} style={{ maxWidth: 200 }}>
                <option value="">—</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input name={`t${i}`} defaultValue={dec(mentions[i]?.text)} placeholder="π.χ. μίλησε για υποτροπή" />
            </div>
          ))}
          <button className="primary" type="submit">Αποθήκευση</button>
        </form>
      ) : session?.noteAt ? (
        <div className="card stack">
          <div><strong>Θέμα</strong><div className="body-text">{dec(session.theme) || "—"}</div></div>
          <div><strong>Ατμόσφαιρα</strong><div className="body-text">{dec(session.atmosphere) || "—"}</div></div>
          {mentions.length > 0 && (
            <div><strong>Προσοχή σε</strong>
              <ul>{mentions.map((m) => <li key={m.id}>{m.member.name}: {dec(m.text)}</li>)}</ul>
            </div>
          )}
        </div>
      ) : (
        <p className="muted">Δεν έχει γραφτεί σημείωμα ακόμα.</p>
      )}
    </main>
  );
}
