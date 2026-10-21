import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHead, Panel } from "@/components/ui";
import { dec, enc } from "@/lib/crypto";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { hasConsent, requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/notify";
import { journalDate } from "@/lib/member";
import { GOAL_CHECK, goalWeek, setWeekGoal } from "@/lib/goals";
import { GoalDays } from "@/components/GoalDays";
import { getSettings } from "@/lib/settings";
import { formatDate, localParts } from "@/lib/time";

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
  const before = await prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date } }, select: { used: true } });
  await prisma.journalEntry.upsert({
    where: { memberId_date: { memberId: user.id, date } },
    create: { memberId: user.id, date, ...fields },
    update: fields,
  });
  // «Έκανα χρήση»: μία γραμμή 7 ημερών στην ομάδα, αφορμή για αξιολόγηση αναγκών, και μήνυμα στη διαχείριση (απόφαση 14/10)· όχι κόκκινο κουτί.
  if (fields.used && !before?.used) {
    await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", body: "Έγραψε στο ημερολόγιο ότι έκανε χρήση — δες το «Σήμερα»", url: "/admin", tag: `alert-${user.id}` }).catch(() => undefined);
  }
  const concern = fields.used || fields.selfHarm === "YES";
  // Σκέψεις να κάνει κακό στον εαυτό του: κόκκινη γραμμή 24 ώρες πάνω-πάνω στο «Σήμερα» όλης της ομάδας (μία φορά τη μέρα).
  if (fields.selfHarm === "YES") {
    const kind = `SELF_HARM:${date}`;
    if (!(await prisma.teamAlert.findFirst({ where: { memberId: user.id, source: "JOURNAL", kind } }))) {
      await prisma.teamAlert.create({ data: { memberId: user.id, source: "JOURNAL", kind, byId: user.id } });
      await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${user.id}` }).catch(() => undefined);
    }
  }
  redirect(`/m/journal?saved=${concern ? "care" : "1"}`, RedirectType.replace);
}

// Ο στόχος της εβδομάδας: ένας, με τα λόγια του μέλους (από Δευτέρα).
async function saveGoal(formData: FormData) {
  "use server";
  const user = await requireMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const text = z.string().trim().min(1).max(300).safeParse(String(formData.get("goal") ?? ""));
  // Ημερολογιακή μέρα: στόχος που γράφεται Δευτέρα πρωί ανήκει σε αυτή την εβδομάδα (όχι στην προηγούμενη, όπως η «μέρα» του ημερολογίου πριν τις 20:00).
  if (text.success) await setWeekGoal(user.id, localParts(new Date()).date, text.data);
  redirect("/m/journal?goal=1", RedirectType.replace);
}

// Κλίμακα 0–10 ως κουμπάκια (20/10): ίδιες ερωτήσεις και ίδιες τιμές, μόνο πιο εύκολη στο δάχτυλο.
function Scale({ name, label, low, high, value }: { name: string; label: string; low: string; high: string; value?: number }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend><strong>{label}</strong></legend>
      <div className="scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, i) => (
          <label key={i}>
            <input type="radio" name={name} value={i} defaultChecked={value === i} required />
            <span>{i}</span>
          </label>
        ))}
      </div>
      <div className="scale-ends"><span>0 = {low}</span><span>10 = {high}</span></div>
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
        <PageHead title="Ημερολόγιο ανάκαμψης" />
        <Panel><p style={{ margin: 0 }}>Το ημερολόγιο δεν είναι ανοιχτό για σένα, γιατί δεν έχεις πει «ναι» γι' αυτό. Αν το θέλεις, μίλα με την ομάδα σου.</p></Panel>
      </main>
    );
  }
  const today = localParts(new Date()).date;
  const [entry, gw] = await Promise.all([
    prisma.journalEntry.findUnique({ where: { memberId_date: { memberId: user.id, date } } }),
    goalWeek(user.id, today),
  ]);
  const goal = gw.goal;

  return (
    <main>
      {/* Πριν την ώρα του ημερολογίου η καταχώριση είναι για χθες (journalDate)· το λέμε (διατύπωση προς έγκριση). */}
      <PageHead title="Ημερολόγιο ανάκαμψης" sub={date === localParts(new Date()).date ? formatDate(date) : `${formatDate(date)} · για χθες — το σημερινό ανοίγει στις ${s.journalTime}`} />
      {/* Υποχρεωτική κεφαλίδα (Πολιτική συλλογής και επεξεργασίας, άρθρο 13.2) — αυτούσιο κείμενο, να μην αλλάξει χωρίς τον DPO.
          Το γενικό crisisNotice των Ρυθμίσεων δεν επαναλαμβάνεται εδώ (20/10: έλεγε το ίδιο δύο φορές)· μένει στο κόκκινο κουμπί. */}
      <p className="m-legal">
        <Icon name="info" size={18} />
        <span>Αν βρίσκεσαι σε άμεσο κίνδυνο, κάλεσε τώρα το <a href="tel:112">112</a> ή το <a href="tel:166">166</a>. Το ημερολόγιο δεν παρακολουθείται σε εικοσιτετράωρη βάση.</span>
      </p>
      {sp.saved === "1" && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.saved === "care" && (
        <Panel className="m-care" >
          <p style={{ marginTop: 0 }}>Αποθηκεύτηκε. Σε ευχαριστούμε που το έγραψες.</p>
          <p><strong>Θέλεις να σε πάρει κάποιος από την ομάδα τώρα;</strong></p>
          <div className="stack">
            <Link className="btn red" href="/m/help?ask=1">Ναι, να με πάρει κάποιος</Link>
            <Link className="btn" href="/m">Όχι τώρα</Link>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Ό,τι γράφεις εδώ το βλέπει μόνο η ομάδα σου. Αν αλλάξεις γνώμη, το κόκκινο κουμπί είναι πάντα εδώ.</p>
        </Panel>
      )}
      <Panel title="Ο στόχος μου αυτή την εβδομάδα" icon="target">
        {sp.goal && <div className="small" style={{ color: "var(--ok)", marginBottom: 6 }}>Αποθηκεύτηκε ✓</div>}
        {goal ? (
          <>
            <div className="body-text" style={{ fontSize: "1.1rem", margin: "0 0 6px" }}>«{goal.text}»</div>
            {/* Οι 7 μέρες της εβδομάδας από τα βραδινά τσεκαρίσματα (21/10)· χωρίς ποσοστά. */}
            <GoalDays days={gw.days} today={today} />
            <div className="hint" style={{ margin: "4px 0 8px" }}>● Ναι · ◐ Λίγο · ○ Όχι σήμερα</div>
            <details className="small">
              <summary>Αλλαγή στόχου</summary>
              <form action={saveGoal} className="row" style={{ gap: 6, marginTop: 6 }}>
                <input name="goal" defaultValue={goal.text} maxLength={300} required style={{ flex: 1 }} />
                <button type="submit">Αλλαγή</button>
              </form>
            </details>
          </>
        ) : (
          <form action={saveGoal}>
            <p className="hint" style={{ margin: "0 0 6px" }}>Ένας μικρός, δικός σου στόχος για αυτή την εβδομάδα. Μία μέρα τη φορά.</p>
            <input name="goal" placeholder="π.χ. να μιλάω όταν ντρέπομαι" maxLength={300} required />
            <button type="submit" style={{ marginTop: 8 }}>Αυτός είναι ο στόχος μου</button>
          </form>
        )}
      </Panel>
      <form action={save} className="panel">
        <div className="panel-head"><h2>Πώς ήταν η μέρα σου</h2></div>
        <Scale name="mood" label="Διάθεση" low="πολύ άσχημα" high="πολύ καλά" value={entry?.mood} />
        <Scale name="confidence" label="Σιγουριά για αύριο" low="καθόλου" high="απόλυτα" value={entry?.confidence} />
        <Scale name="craving" label="Λαχτάρα" low="καθόλου" high="πολύ έντονη" value={entry?.craving} />
        <div className="field">
          <label htmlFor="sleepHours"><strong>Ύπνος (ώρες)</strong></label>
          <input id="sleepHours" name="sleepHours" type="number" inputMode="decimal" min={0} max={24} step={0.5} defaultValue={entry?.sleepHours} required style={{ maxWidth: 160 }} />
        </div>
        <div className="field">
          <label htmlFor="win"><strong>Μια νίκη σήμερα</strong> (προαιρετικό)</label>
          <input id="win" name="win" maxLength={500} placeholder="κάτι μικρό που τα κατάφερες" defaultValue={dec(entry?.win)} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>Υπήρξε κάτι σήμερα που θέλεις να ξέρει η ομάδα;</strong> <span className="muted small">τσέκαρε μόνο αν ισχύει</span></legend>
          <label className="m-check">
            <input type="checkbox" name="used" defaultChecked={entry?.used} /> <span>Έκανα χρήση</span>
          </label>
          <label className="m-check">
            <input type="checkbox" name="harm" defaultChecked={entry ? entry.selfHarm === "YES" || entry.selfHarm === "UNSURE" : false} /> <span>Είχα σκέψεις να κάνω κακό στον εαυτό μου</span>
          </label>
        </fieldset>
        {goal && (
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend><strong>Σήμερα ήμουν συνεπής με τον στόχο μου;</strong> <span className="muted small">«{goal.text}»</span></legend>
            {Object.entries(GOAL_CHECK).map(([v, l]) => (
              <label key={v} className="m-check">
                <input type="radio" name="goalCheck" value={v} defaultChecked={entry?.goalCheck === v} /> {l}
              </label>
            ))}
            <input name="goalNote" aria-label="Τι με βοήθησε / τι με δυσκόλεψε (προαιρετικό)" placeholder="τι με βοήθησε / τι με δυσκόλεψε (προαιρετικό)" defaultValue={dec(entry?.goalNote)} style={{ marginTop: 6 }} />
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="note"><strong>Κάτι που θέλεις να γράψεις</strong> (προαιρετικό)</label>
          <textarea id="note" name="note" defaultValue={dec(entry?.note)} />
        </div>
        {/* Ενημέρωση πριν την αποθήκευση (απόφαση 14/10, εγκρίθηκε 15/10): ολόκληρη η καταχώριση — και η σημείωση και η νίκη — μπορεί να τη δει η ομάδα. */}
        <p className="muted small" style={{ margin: "4px 0 10px" }}>Ό,τι γράφεις εδώ — οι απαντήσεις, η σημείωση και η νίκη σου — μπορεί να το δει ολόκληρο η ομάδα σου (οι θεραπευτές σου και η διαχείριση). Κανείς άλλος.</p>
        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </main>
  );
}
