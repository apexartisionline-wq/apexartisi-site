import Link from "next/link";
import { dec, enc } from "@/lib/crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasConsent, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/notify";
import { journalDate } from "@/lib/member";
import { GOAL_CHECK, setWeekGoal, weekGoal } from "@/lib/goals";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";

const scale = z.coerce.number().int().min(0).max(10);
const schema = z.object({
  mood: scale,
  confidence: scale,
  craving: scale,
  sleepHours: z.coerce.number().min(0).max(24),
  // Μία ήπια ερώτηση αντί για δύο κάθε βράδυ: «Υπήρξε κάτι σήμερα που θέλεις να ξέρει η ομάδα;»
  harm: z.literal("on").optional(),
  used: z.literal("on").optional(),
  win: z.string().max(500).default(""),
  note: z.string().max(5000).default(""),
  goalCheck: z.enum(["YES", "PARTLY", "NO"]).optional(),
  goalNote: z.string().max(1000).default(""),
});

async function save(formData: FormData) {
  "use server";
  const user = await requireMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const date = journalDate(new Date(), s);
  const { harm, used, ...data } = schema.parse(Object.fromEntries(formData));
  const fields = {
    ...data,
    used: Boolean(used),
    selfHarm: harm ? ("YES" as const) : ("NO" as const),
    note: enc(data.note),
    win: enc(data.win.trim()),
    goalCheck: data.goalCheck ?? null,
    goalNote: enc(data.goalNote),
  };
  await prisma.journalEntry.upsert({
    where: { memberId_date: { memberId: user.id, date } },
    create: { memberId: user.id, date, ...fields },
    update: fields,
  });
  const concern = fields.used || fields.selfHarm === "YES";
  // Σκέψεις να κάνει κακό στον εαυτό του: κόκκινη γραμμή 24 ώρες πάνω-πάνω στο «Σήμερα» όλης της ομάδας (μία φορά τη μέρα).
  if (fields.selfHarm === "YES") {
    const kind = `SELF_HARM:${date}`;
    if (!(await prisma.teamAlert.findFirst({ where: { memberId: user.id, source: "JOURNAL", kind } }))) {
      await prisma.teamAlert.create({ data: { memberId: user.id, source: "JOURNAL", kind, byId: user.id } });
      await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${user.id}` }).catch(() => undefined);
    }
  }
  redirect(`/m/journal?saved=${concern ? "care" : "1"}`);
}

// Ο στόχος της εβδομάδας: ένας, με τα λόγια του μέλους (από Δευτέρα).
async function saveGoal(formData: FormData) {
  "use server";
  const user = await requireMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const text = z.string().trim().min(1).max(300).safeParse(String(formData.get("goal") ?? ""));
  if (text.success) await setWeekGoal(user.id, journalDate(new Date(), s), text.data);
  redirect("/m/journal?goal=1");
}

function Scale({ name, label, low, high, value }: { name: string; label: string; low: string; high: string; value?: number }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend><strong>{label}</strong></legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 2 }}>
        {Array.from({ length: 11 }, (_, i) => (
          <label key={i} style={{ margin: 0, textAlign: "center", minWidth: 0 }}>
            <input type="radio" name={name} value={i} defaultChecked={value === i} required style={{ width: "auto" }} />
            <div>{i}</div>
          </label>
        ))}
      </div>
      <div className="row spread small muted"><span>0 = {low}</span><span>10 = {high}</span></div>
    </fieldset>
  );
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ saved?: string; goal?: string }> }) {
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
  const [entry, goal] = await Promise.all([
    prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date } } }),
    weekGoal(user.id, date),
  ]);

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
          <p className="muted small">Ό,τι γράφεις εδώ το βλέπει μόνο η ομάδα σου. Αν αλλάξεις γνώμη, το κόκκινο κουμπί είναι πάντα εδώ.</p>
        </div>
      )}
      <section className="card">
        <strong>Ο στόχος μου αυτή την εβδομάδα</strong>
        {sp.goal && <div className="small" style={{ color: "var(--ok)" }}>Αποθηκεύτηκε ✓</div>}
        {goal ? (
          <>
            <div className="body-text" style={{ fontSize: "1.1rem", margin: "6px 0" }}>«{goal.text}»</div>
            <details className="small">
              <summary>Αλλαγή στόχου</summary>
              <form action={saveGoal} className="row" style={{ gap: 6, marginTop: 6 }}>
                <input name="goal" defaultValue={goal.text} maxLength={300} required style={{ flex: 1 }} />
                <button type="submit">Αλλαγή</button>
              </form>
            </details>
          </>
        ) : (
          <form action={saveGoal} style={{ marginTop: 6 }}>
            <p className="muted small" style={{ margin: "0 0 6px" }}>Ένας μικρός, δικός σου στόχος για αυτή την εβδομάδα. Μία μέρα τη φορά.</p>
            <input name="goal" placeholder="π.χ. να μιλάω όταν ντρέπομαι" maxLength={300} required />
            <button type="submit" style={{ marginTop: 8 }}>Αυτός είναι ο στόχος μου</button>
          </form>
        )}
      </section>
      <p className="small muted">{s.crisisNotice}</p>
      <form action={save} className="card">
        <Scale name="mood" label="Διάθεση" low="πολύ άσχημα" high="πολύ καλά" value={entry?.mood} />
        <Scale name="confidence" label="Σιγουριά για αύριο" low="καθόλου" high="απόλυτα" value={entry?.confidence} />
        <Scale name="craving" label="Λαχτάρα" low="καθόλου" high="πολύ έντονη" value={entry?.craving} />
        <div className="field">
          <label htmlFor="sleepHours"><strong>Ύπνος (ώρες)</strong></label>
          <input id="sleepHours" name="sleepHours" type="number" min={0} max={24} step={0.5} defaultValue={entry?.sleepHours} required />
        </div>
        <div className="field">
          <label htmlFor="win"><strong>Μια νίκη σήμερα</strong> (προαιρετικό)</label>
          <input id="win" name="win" maxLength={500} placeholder="κάτι μικρό που τα κατάφερες" defaultValue={dec(entry?.win)} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>Υπήρξε κάτι σήμερα που θέλεις να ξέρει η ομάδα;</strong> <span className="muted small">τσέκαρε μόνο αν ισχύει</span></legend>
          <label className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input type="checkbox" name="used" defaultChecked={entry?.used} style={{ width: "auto", flex: "none" }} /> <span>Έκανα χρήση</span>
          </label>
          <label className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input type="checkbox" name="harm" defaultChecked={entry ? entry.selfHarm === "YES" || entry.selfHarm === "UNSURE" : false} style={{ width: "auto", flex: "none" }} /> <span>Είχα σκέψεις να κάνω κακό στον εαυτό μου</span>
          </label>
        </fieldset>
        {goal && (
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend><strong>Σήμερα ήμουν συνεπής με τον στόχο μου;</strong> <span className="muted small">«{goal.text}»</span></legend>
            {Object.entries(GOAL_CHECK).map(([v, l]) => (
              <label key={v} className="row" style={{ gap: 8 }}>
                <input type="radio" name="goalCheck" value={v} defaultChecked={entry?.goalCheck === v} style={{ width: "auto" }} /> {l}
              </label>
            ))}
            <input name="goalNote" placeholder="τι με βοήθησε / τι με δυσκόλεψε (προαιρετικό)" defaultValue={dec(entry?.goalNote)} style={{ marginTop: 6 }} />
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="note"><strong>Κάτι που θέλεις να γράψεις</strong> (προαιρετικό)</label>
          <textarea id="note" name="note" defaultValue={dec(entry?.note)} />
        </div>
        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </main>
  );
}
