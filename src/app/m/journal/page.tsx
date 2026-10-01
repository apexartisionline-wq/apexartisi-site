import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasConsent, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { journalDate } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

const scale = z.coerce.number().int().min(0).max(10);
const schema = z.object({
  mood: scale,
  confidence: scale,
  craving: scale,
  sleepHours: z.coerce.number().min(0).max(24),
  selfHarm: z.enum(["NO", "PASSING", "YES", "UNSURE"]),
  used: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  note: z.string().max(5000).default(""),
});

async function save(formData: FormData) {
  "use server";
  const user = await requireMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const date = journalDate(new Date(), s);
  const data = schema.parse(Object.fromEntries(formData));
  await prisma.journalEntry.upsert({
    where: { memberId_date: { memberId: user.id, date } },
    create: { memberId: user.id, date, ...data, note: enc(data.note) },
    update: { ...data, note: enc(data.note) },
  });
  const concern = data.used || data.selfHarm === "YES" || data.selfHarm === "UNSURE";
  redirect(`/m/journal?saved=${concern ? "care" : "1"}`);
}

function Scale({ name, label, low, high, value }: { name: string; label: string; low: string; high: string; value?: number }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend><strong>{label}</strong></legend>
      <div className="row" style={{ gap: 6 }}>
        {Array.from({ length: 11 }, (_, i) => (
          <label key={i} style={{ margin: 0, textAlign: "center", width: 34 }}>
            <input type="radio" name={name} value={i} defaultChecked={value === i} required style={{ width: "auto" }} />
            <div>{i}</div>
          </label>
        ))}
      </div>
      <div className="row spread small muted"><span>0 = {low}</span><span>10 = {high}</span></div>
    </fieldset>
  );
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireMember();
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  const date = journalDate(new Date(), s);
  if (!(await hasConsent(user.id, "journal"))) {
    return (
      <main>
        <h1>Ημερολόγιο ανάκαμψης</h1>
        <p>Το ημερολόγιο δεν είναι ενεργό για σένα, γιατί δεν έχεις δώσει συγκατάθεση γι' αυτό. Αν το θέλεις, μίλα με την ομάδα.</p>
      </main>
    );
  }
  const entry = await prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date } } });

  return (
    <main>
      <h1>Ημερολόγιο ανάκαμψης</h1>
      <p className="muted">{formatDate(date)}</p>
      {sp.saved === "1" && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.saved === "care" && (
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <p style={{ marginTop: 0 }}>Αποθηκεύτηκε. Ευχαριστούμε που το έγραψες ειλικρινά.</p>
          <p><strong>Θέλεις να σε πάρει κάποιος από την ομάδα τώρα;</strong></p>
          <div className="stack">
            <Link className="btn red" href="/m/help?ask=1">Ναι, να με πάρει κάποιος</Link>
            <Link className="btn" href="/m">Όχι τώρα</Link>
          </div>
          <p className="muted small">Η απάντησή σου στο ημερολόγιο δεν ειδοποιεί κανέναν από μόνη της. Αν αλλάξεις γνώμη, το κόκκινο κουμπί είναι πάντα εδώ.</p>
        </div>
      )}
      <p className="small muted">{s.crisisNotice}</p>
      <form action={save} className="card">
        <Scale name="mood" label="Διάθεση" low="πολύ άσχημα" high="πολύ καλά" value={entry?.mood} />
        <Scale name="confidence" label="Σιγουριά για αύριο" low="καθόλου" high="απόλυτα" value={entry?.confidence} />
        <Scale name="craving" label="Λαχτάρα" low="καθόλου" high="πολύ έντονη" value={entry?.craving} />
        <div className="field">
          <label htmlFor="sleepHours"><strong>Ύπνος (ώρες)</strong></label>
          <input id="sleepHours" name="sleepHours" type="number" min={0} max={24} step={0.5} defaultValue={entry?.sleepHours} required />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>Σκέψεις να κάνεις κακό στον εαυτό σου σήμερα;</strong></legend>
          {[
            ["NO", "Όχι"],
            ["PASSING", "Πέρασε μια σκέψη"],
            ["YES", "Ναι"],
            ["UNSURE", "Δεν είμαι σίγουρος/η"],
          ].map(([v, l]) => (
            <label key={v} className="row" style={{ gap: 8 }}>
              <input type="radio" name="selfHarm" value={v} defaultChecked={entry?.selfHarm === v} required style={{ width: "auto" }} /> {l}
            </label>
          ))}
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>Έγινε χρήση σήμερα;</strong></legend>
          <label className="row" style={{ gap: 8 }}>
            <input type="radio" name="used" value="no" defaultChecked={entry ? !entry.used : false} required style={{ width: "auto" }} /> Όχι
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="radio" name="used" value="yes" defaultChecked={entry?.used} required style={{ width: "auto" }} /> Ναι
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="note"><strong>Κάτι που θέλεις να γράψεις</strong> (προαιρετικό)</label>
          <textarea id="note" name="note" defaultValue={dec(entry?.note)} />
        </div>
        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </main>
  );
}
