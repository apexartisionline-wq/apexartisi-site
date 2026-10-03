import Link from "next/link";
import { gr } from "@/lib/assessment";
import { EC_WHEN, profileHistory } from "@/lib/assessment-db";
import { notFound } from "next/navigation";
import { dec, enc } from "@/lib/crypto";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cycleInfo } from "@/lib/member";
import { programDay } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatWhen, localParts } from "@/lib/time";
import { newCycle, updatePerson } from "../actions";
import { ResetCodeForm } from "../CodeForms";
import { MemberSessions } from "@/components/MemberSessions";

const SELF_HARM = { NO: "όχι", PASSING: "πέρασε μια σκέψη", YES: "ναι", UNSURE: "δεν είμαι σίγουρος/η" } as const;

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp, s] = await Promise.all([params, searchParams, getSettings()]);
  const p = await prisma.user.findUnique({ where: { id } });
  if (!p) notFound();
  const admin = await requireRole("ADMIN");
  if (p.role === "MEMBER") await logAccess(admin.id, p.id, "journal_view");
  const today = localParts(new Date()).date;
  const isMember = p.role === "MEMBER";

  const ph = isMember ? await profileHistory(p.id) : null;
  const profile = ph?.cur ?? null;
  const telLink = (v: string) => (v ? <a href={`tel:${v.replace(/\s/g, "")}`}>{v}</a> : null);
  const [cycle, journal, attendance] = isMember
    ? await Promise.all([
        cycleInfo(p.id),
        prisma.journalEntry.findMany({ where: { memberId: p.id, date: { gte: addDays(today, -20) } }, orderBy: { date: "desc" } }),
        prisma.attendance.findMany({ where: { memberId: p.id, date: { gte: addDays(today, -30) } }, orderBy: { date: "desc" } }),
      ])
    : [null, [], []];

  return (
    <>
      <h1>{p.name}</h1>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}

      {isMember && (
        profile ? (
          <section className="card" style={{ borderColor: "var(--accent)" }}>
            <strong>Έκτακτη ανάγκη</strong>
            <div style={{ marginTop: 8 }}>{profile.data.address || <span className="muted">Χωρίς διεύθυνση</span>}{profile.data.abroadCountry && ` · ${profile.data.abroadCountry}`}</div>
            <div>Κινητό μέλους: {telLink(profile.data.mobile) ?? <span className="muted">—</span>}</div>
            {profile.data.ecName ? (
              <div style={{ marginTop: 6 }}>
                Επαφή: <strong>{profile.data.ecName}</strong>{profile.data.ecRelation && ` (${profile.data.ecRelation})`} · {telLink(profile.data.ecPhone)}
                <div className="small muted">
                  {profile.data.ecWhen ? EC_WHEN[profile.data.ecWhen] : "Δεν έχει πει πότε μπορούμε να καλέσουμε"}
                  {profile.data.ecWhatToSay && ` · Τι λέμε: ${profile.data.ecWhatToSay}`}
                </div>
              </div>
            ) : <div className="small muted" style={{ marginTop: 6 }}>Δεν έχει δώσει άνθρωπο για έκτακτη ανάγκη.</div>}
            <details className="small" style={{ marginTop: 8 }}>
              <summary>Όλα τα στοιχεία από το μέλος</summary>
              <div>{profile.data.fullName}{profile.data.preferredName && ` · τον/την λέμε ${profile.data.preferredName}`}</div>
              <div>Γέννηση: {profile.data.birthDate ? gr(profile.data.birthDate) : "—"}</div>
              <div>Email: {profile.data.email || "—"}</div>
            </details>
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Τελευταία αλλαγή {formatWhen(profile.at)}{ph && ph.changed.length > 0 && ` · άλλαξαν: ${ph.changed.join(", ")}`}{ph && ph.count > 1 && ` · ${ph.count} αποθηκεύσεις`}
              {" · "}<Link href={`/t/members/${p.id}/assessment`}>Αρχική αξιολόγηση ›</Link>
            </p>
          </section>
        ) : (
          <div className="card muted small">Δεν έχει συμπληρώσει ακόμα τα στοιχεία «Πριν την 1η ατομική» (διεύθυνση, επαφή έκτακτης ανάγκης).</div>
        )
      )}

      <form action={updatePerson} className="card">
        <input type="hidden" name="id" value={p.id} />
        <div className="grid2">
          <div className="field"><label>Ονοματεπώνυμο</label><input name="name" defaultValue={p.name} required /></div>
          <div className="field"><label>Όνομα χρήστη</label><input value={p.username} disabled /></div>
          <div className="field"><label>Κινητό λογαριασμού (για το κόκκινο κουμπί)</label><input name="phone" type="tel" defaultValue={p.phone ?? ""} /></div>
          {isMember && <div className="field"><label>Κωδικός μέλους (για τα Google Forms)</label><input value={p.memberCode ?? "—"} disabled /></div>}
          {isMember ? (
            <>
              <div className="field">
                <label>Από πού ήρθε</label>
                <select name="source" defaultValue={p.source ?? "APEX"}>
                  <option value="APEX">apex/rtisi online</option>
                  <option value="AUTOGNOSIA_PLUS">ΑΥΤΟΓΝΩΣΙΑ PLUS</option>
                </select>
              </div>
              <div className="field">
                <label>Έναρξη προγράμματος (μέρα {programDay(p.programStartDate, today) ?? "—"})</label>
                <input name="programStartDate" type="date" defaultValue={p.programStartDate ?? ""} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>Τύπος (εναλλαγή ατομικών)</label>
                <select name="therapistKind" defaultValue={p.therapistKind ?? ""}>
                  <option value="">— (δεν κάνει ατομικές)</option>
                  <option value="BIOMATIC">Βιωματικός σύμβουλος</option>
                  <option value="CLINICAL">Κλινικός ψυχολόγος</option>
                  <option value="BOTH">Και τα δύο</option>
                </select>
              </div>
              <div className="field"><label>Telegram user ID</label><input name="telegramUserId" defaultValue={p.telegramUserId ?? ""} /></div>
            </>
          )}
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" name="active" defaultChecked={p.active} style={{ width: "auto" }} /> Ενεργός λογαριασμός
          </label>
        </div>
        <button className="primary" type="submit">Αποθήκευση</button>
      </form>

      <ResetCodeForm id={p.id} />

      {isMember && (
        <>
          <p><Link className="btn" href={`/admin/people/${p.id}/close`}>Ολοκλήρωση συνεργασίας ›</Link></p>
          <h2>Κύκλος ατομικών</h2>
          <form action={newCycle} className="card row spread">
            <input type="hidden" name="id" value={p.id} />
            <span>{cycle ? `Τρέχων κύκλος: ${cycle.booked} κλεισμένες, ${cycle.done} έγιναν, από ${cycle.length}` : "Δεν υπάρχει ανοιχτός κύκλος."}</span>
            <span className="row">
              <input name="length" type="number" min={1} defaultValue={s.cycleLength} style={{ width: 80 }} />
              <button type="submit">Νέος κύκλος</button>
            </span>
          </form>

          <h2>Ατομικές και σημειώματα</h2>
          <MemberSessions memberId={p.id} />

          <h2>Παρουσίες στην ομάδα (30 μέρες): {attendance.length}</h2>
          <div className="card small">{attendance.map((a) => formatDate(a.date)).join(" · ") || <span className="muted">Καμία.</span>}</div>

          <h2>Ημερολόγιο ανάκαμψης (3 εβδομάδες)</h2>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Μέρα</th><th>Διάθεση</th><th>Σιγουριά</th><th>Λαχτάρα</th><th>Ύπνος</th><th>Αυτοτρ.</th><th>Χρήση</th><th>Νίκη</th><th>Σημείωση</th></tr></thead>
              <tbody>
                {journal.map((j) => (
                  <tr key={j.id}>
                    <td>{formatDate(j.date)}</td>
                    <td>{j.mood}</td>
                    <td>{j.confidence}</td>
                    <td>{j.craving}</td>
                    <td>{j.sleepHours}</td>
                    <td>{j.selfHarm === "YES" || j.selfHarm === "UNSURE" ? <span className="badge red">{SELF_HARM[j.selfHarm]}</span> : SELF_HARM[j.selfHarm]}</td>
                    <td>{j.used ? <span className="badge red">ναι</span> : "όχι"}</td>
                    <td className="small">{dec(j.win)}</td>
                    <td className="small">{dec(j.note)}</td>
                  </tr>
                ))}
                {journal.length === 0 && <tr><td colSpan={9} className="muted">Καμία εγγραφή.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
