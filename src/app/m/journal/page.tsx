import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHead, Panel } from "@/components/ui";
import { dec, enc } from "@/lib/crypto";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { hasConsent, requireProgramMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/notify";
import { journalDate } from "@/lib/member";
import { GOAL_CHECK, goalWeek, setWeekGoal } from "@/lib/goals";
import { GoalDays } from "@/components/GoalDays";
import { GoalCheck } from "@/components/GoalCheck";
import { getSettings } from "@/lib/settings";
import { formatDate, localParts } from "@/lib/time";
import { REACTION, SELF_CARE, SELF_HARM_CHOICES, VALUES, WAKE, parseAnswers, type JournalAnswers } from "@/lib/journal-questions";

const scale = (min: number) => z.coerce.number().int().min(min).max(10);
const text = (max = 2000) => z.string().max(max).default("");
// Οι 18 ερωτήσεις του τετραδίου (journal-questions.ts). Υποχρεωτικές: 1, 2, 3, 4, 5, 16, 18 — οι υπόλοιπες προαιρετικές.
const schema = z.object({
  wake: z.enum(WAKE),
  mood: scale(1),
  sleepHours: z.coerce.number().min(0).max(24),
  used: z.enum(["NO", "YES"]),
  cravingAny: z.enum(["NO", "YES"]),
  craving: z.coerce.number().int().min(0).max(10).optional(),
  cravingWhere: text(),
  cravingCoping: text(),
  challenge: text(),
  reactionNote: text(),
  pattern: text(),
  win: text(500),
  values: z.enum(["YES", "NO", "PARTLY"]).optional(),
  gratitude: text(),
  learned: text(),
  confidence: scale(1),
  tomorrow: text(),
  selfHarm: z.enum(["NO", "PASSING", "YES", "UNSURE"]),
  note: text(5000),
});

async function save(formData: FormData) {
  "use server";
  const user = await requireProgramMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const date = journalDate(new Date(), s);
  const raw = Object.fromEntries([...formData.keys()].filter((k) => k !== "reaction" && k !== "selfCare").map((k) => [k, formData.get(k)]));
  const d = schema.parse(raw);
  const pick = (k: string, allowed: readonly string[]) => formData.getAll(k).map(String).filter((v) => allowed.includes(v));
  const cravingAny = d.cravingAny === "YES";
  const answers: JournalAnswers = {
    wake: d.wake,
    cravingAny,
    cravingWhere: cravingAny ? d.cravingWhere.trim() : "",
    cravingCoping: cravingAny ? d.cravingCoping.trim() : "",
    challenge: d.challenge.trim(),
    reaction: pick("reaction", REACTION),
    reactionNote: d.reactionNote.trim(),
    pattern: d.pattern.trim(),
    selfCare: pick("selfCare", SELF_CARE),
    values: d.values,
    gratitude: d.gratitude.trim(),
    learned: d.learned.trim(),
    tomorrow: d.tomorrow.trim(),
  };
  const fields = {
    mood: d.mood,
    confidence: d.confidence,
    craving: cravingAny ? (d.craving ?? 0) : 0,
    sleepHours: d.sleepHours,
    used: d.used === "YES",
    selfHarm: d.selfHarm,
    note: enc(d.note),
    win: enc(d.win.trim()),
    answers: enc(JSON.stringify(answers)),
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
  // Ερώτηση 18: «Ναι» ή «Δεν είμαι σίγουρος/η» = ίδιος κανόνας με πριν παντού (κόκκινη γραμμή 24 ωρών στο «Σήμερα» όλης της ομάδας,
  // σήμα, αφορμή για αξιολόγηση αναγκών, μήνυμα στη διαχείριση). «Πέρασε μια σκέψη, αλλά έφυγε» δεν ανάβει σήμα (ίδιος κανόνας με το
  // υπάρχον PASSING — προς επιβεβαίωση από την υπεύθυνη)· φαίνεται όμως στην καταχώριση της μέρας.
  const serious = fields.selfHarm === "YES" || fields.selfHarm === "UNSURE";
  if (serious) {
    const kind = `SELF_HARM:${date}`;
    if (!(await prisma.teamAlert.findFirst({ where: { memberId: user.id, source: "JOURNAL", kind } }))) {
      await prisma.teamAlert.create({ data: { memberId: user.id, source: "JOURNAL", kind, byId: user.id } });
      await notifyRole("ADMIN", { title: "Νέο σοβαρό σημείο στην ομάδα", url: "/admin", tag: `alert-${user.id}` }).catch(() => undefined);
    }
  }
  // Στο μέλος: όπως λέει το τετράδιο, «αν δεν απάντησες «Όχι»: μίλησε σε κάποιον» — η ήπια πρόταση για κάθε απάντηση εκτός από «Όχι».
  const concern = fields.used || fields.selfHarm !== "NO";
  redirect(`/m/journal?saved=${concern ? "care" : "1"}`, RedirectType.replace);
}

// Ο στόχος της εβδομάδας: ένας, με τα λόγια του μέλους (από Δευτέρα).
async function saveGoal(formData: FormData) {
  "use server";
  const user = await requireProgramMember();
  if (!(await hasConsent(user.id, "journal"))) redirect("/m/journal");
  const s = await getSettings();
  const text = z.string().trim().min(1).max(300).safeParse(String(formData.get("goal") ?? ""));
  // Ημερολογιακή μέρα: στόχος που γράφεται Δευτέρα πρωί ανήκει σε αυτή την εβδομάδα (όχι στην προηγούμενη, όπως η «μέρα» του ημερολογίου πριν τις 20:00).
  if (text.success) await setWeekGoal(user.id, localParts(new Date()).date, text.data);
  redirect("/m/journal?goal=1", RedirectType.replace);
}

// Κλίμακα 0–10 ως κουμπάκια (20/10): ίδιες ερωτήσεις και ίδιες τιμές, μόνο πιο εύκολη στο δάχτυλο.
function Scale({ name, label, low, high, value, min = 0, hint, required = true }: { name: string; label: string; low: string; high: string; value?: number; min?: number; hint?: string; required?: boolean }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend><strong>{label}</strong></legend>
      {hint && <div className="hint" style={{ margin: "2px 0 6px" }}>{hint}</div>}
      <div className={`scale${min === 1 ? " s10" : ""}`} role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 - min }, (_, k) => k + min).map((i) => (
          <label key={i}>
            <input type="radio" name={name} value={i} defaultChecked={value === i} required={required} />
            <span>{i}</span>
          </label>
        ))}
      </div>
      <div className="scale-ends"><span>{min} = {low}</span><span>10 = {high}</span></div>
    </fieldset>
  );
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ saved?: string; goal?: string }> }) {
  const user = await requireProgramMember();
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
  const a = parseAnswers(dec(entry?.answers));

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
            <GoalCheck current={gw.days.find((d) => d.date === today)?.check ?? null} back="/m/journal" />
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
      {/* Το πραγματικό «Ημερολόγιο της Ανάκαμψής μου» (τετράδιο v2): οι 18 ερωτήσεις κάθε βραδιού, με τη σειρά και τα λόγια του. */}
      <form action={save} className="panel jform">
        <div className="panel-head"><h2>Το Ημερολόγιο της Ανάκαμψής μου</h2></div>
        <p className="hint" style={{ marginTop: 0 }}>Τρία με πέντε λεπτά. Δεν υπάρχει σωστή ή λάθος απάντηση — μόνο η δική σου αλήθεια. Μια μέρα τη φορά.</p>

        <h3 className="jsec">Η μέρα μου</h3>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>1. Πώς ξύπνησα σήμερα;</strong></legend>
          {WAKE.map((w) => (
            <label key={w} className="m-check"><input type="radio" name="wake" value={w} defaultChecked={a.wake === w} required /> <span>{w}</span></label>
          ))}
        </fieldset>
        <Scale name="mood" label="2. Η διάθεσή μου σήμερα" low="πολύ χαμηλή" high="πολύ καλή" min={1} value={entry?.mood} />
        <div className="field">
          <label htmlFor="sleepHours"><strong>3. Πόσες ώρες κοιμήθηκα χθες βράδυ;</strong></label>
          <input id="sleepHours" name="sleepHours" type="number" inputMode="decimal" min={0} max={24} step={0.5} defaultValue={entry?.sleepHours} required style={{ maxWidth: 160 }} />
        </div>

        <h3 className="jsec">Χρήση και λαχτάρα</h3>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>4. Έκανα χρήση σήμερα;</strong></legend>
          <div className="hint" style={{ margin: "2px 0 6px" }}>Η αλήθεια εδώ δεν τιμωρείται. Χρησιμεύει για να ξέρεις πώς να φροντίσεις τον εαυτό σου αύριο.</div>
          <div className="row">
            <label className="m-check"><input type="radio" name="used" value="NO" defaultChecked={entry ? !entry.used : false} required /> <span>Όχι</span></label>
            <label className="m-check"><input type="radio" name="used" value="YES" defaultChecked={entry?.used} /> <span>Ναι</span></label>
          </div>
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>5. Ένιωσα σήμερα λαχτάρα ή παρόρμηση;</strong></legend>
          <div className="row">
            <label className="m-check"><input type="radio" name="cravingAny" value="NO" defaultChecked={entry ? !(a.cravingAny ?? entry.craving > 0) : false} required /> <span>Όχι</span></label>
            <label className="m-check"><input type="radio" name="cravingAny" value="YES" defaultChecked={entry ? (a.cravingAny ?? entry.craving > 0) : false} /> <span>Ναι</span></label>
          </div>
        </fieldset>
        <div className="jif-craving">
          <Scale name="craving" label="Πόσο δυνατή ήταν η πιο έντονη στιγμή;" hint="0 = καμία · 5 = έντονη σκέψη, αλλά τη διαχειρίστηκα · 10 = ήμουν πολύ κοντά" low="καμία" high="πολύ έντονη" value={entry?.craving} required={false} />
          <div className="field">
            <label htmlFor="cravingWhere"><strong>6. Αν ένιωσα λαχτάρα: πού ήμουν και τι είχε προηγηθεί;</strong></label>
            <div className="hint">Ώρα, μέρος, ποιος ήταν εκεί, τι είχε συμβεί λίγο πριν.</div>
            <textarea id="cravingWhere" name="cravingWhere" maxLength={2000} defaultValue={a.cravingWhere} />
          </div>
          <div className="field">
            <label htmlFor="cravingCoping"><strong>7. Αν ένιωσα λαχτάρα: τι έκανα για να τη διαχειριστώ;</strong></label>
            <textarea id="cravingCoping" name="cravingCoping" maxLength={2000} defaultValue={a.cravingCoping} />
          </div>
        </div>

        <h3 className="jsec">Η πρόκληση της ημέρας</h3>
        <div className="field">
          <label htmlFor="challenge"><strong>8. Η μεγαλύτερη πρόκληση της ημέρας</strong></label>
          <div className="hint">Π.χ. άγχος, κουραστική μέρα, δύσκολη συζήτηση, αρνητικές σκέψεις.</div>
          <textarea id="challenge" name="challenge" maxLength={2000} defaultValue={a.challenge} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>9. Πώς αντέδρασα;</strong></legend>
          <div className="chips">
            {REACTION.map((r) => (
              <label key={r} className="chip"><input type="checkbox" name="reaction" value={r} defaultChecked={a.reaction?.includes(r)} /> <span>{r}</span></label>
            ))}
          </div>
          <input name="reactionNote" aria-label="Αν θέλεις, γράψε λίγα λόγια για το πώς αντέδρασες" placeholder="Αν θέλεις, γράψε λίγα λόγια για το πώς αντέδρασες" maxLength={2000} defaultValue={a.reactionNote} style={{ marginTop: 8 }} />
        </fieldset>
        <div className="field">
          <label htmlFor="pattern"><strong>10. Παρατήρησα κάτι που επαναλαμβάνεται σε εμένα;</strong></label>
          <div className="hint">Μια σκέψη, μια συνήθεια, ένας τρόπος αντίδρασης. «Όταν κουράζομαι, τείνω να…»</div>
          <textarea id="pattern" name="pattern" maxLength={2000} defaultValue={a.pattern} />
        </div>

        <h3 className="jsec">Τα καλά της μέρας</h3>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>11. Τι καλό έκανα για τον εαυτό μου σήμερα;</strong></legend>
          <div className="chips">
            {SELF_CARE.map((c) => (
              <label key={c} className="chip"><input type="checkbox" name="selfCare" value={c} defaultChecked={a.selfCare?.includes(c)} /> <span>{c}</span></label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="win"><strong>12. Η μικρή νίκη της ημέρας μου</strong></label>
          <div className="hint">Κάτι που έκανες καλά, διαφορετικά ή λίγο καλύτερα. Δεν χρειάζεται να είναι μεγάλο.</div>
          <input id="win" name="win" maxLength={500} defaultValue={dec(entry?.win)} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>13. Οι πράξεις μου ήταν εναρμονισμένες με τις αξίες μου;</strong></legend>
          <div className="row">
            {Object.entries(VALUES).map(([v, l]) => (
              <label key={v} className="m-check"><input type="radio" name="values" value={v} defaultChecked={a.values === v} /> <span>{l}</span></label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="gratitude"><strong>14. Για τι νιώθω ευγνωμοσύνη σήμερα;</strong></label>
          <textarea id="gratitude" name="gratitude" maxLength={2000} defaultValue={a.gratitude} />
        </div>
        <div className="field">
          <label htmlFor="learned"><strong>15. Τι έμαθα σήμερα για τον εαυτό μου;</strong></label>
          <textarea id="learned" name="learned" maxLength={2000} defaultValue={a.learned} />
        </div>

        <h3 className="jsec">Αύριο</h3>
        <Scale name="confidence" label="16. Πόσο σίγουρος/η είμαι ότι αύριο δεν θα κάνω χρήση;" low="καθόλου" high="απόλυτα" min={1} value={entry?.confidence} />
        <div className="field">
          <label htmlFor="tomorrow"><strong>17. Τι μπορεί να με δυσκολέψει αύριο, και τι θα κάνω αν συμβεί;</strong></label>
          <div className="hint">«Αν ______, τότε θα ______.»</div>
          <textarea id="tomorrow" name="tomorrow" maxLength={2000} defaultValue={a.tomorrow} />
        </div>

        {/* Η συνέπεια με τον στόχο δεν ρωτιέται πια εδώ (25/10): πατιέται πάνω στην κάρτα του στόχου. */}

        <h3 className="jsec">Η ασφάλειά μου</h3>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>18. Σήμερα είχα σκέψεις να βλάψω τον εαυτό μου;</strong></legend>
          {SELF_HARM_CHOICES.map((c) => (
            <label key={c.value} className="m-check"><input type="radio" name="selfHarm" value={c.value} defaultChecked={entry?.selfHarm === c.value} required /> <span>{c.label}</span></label>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>Αν δεν απάντησες «Όχι»: μίλησε σε κάποιον που εμπιστεύεσαι. Όποια ώρα: <a href="tel:1018">1018</a>. Επείγον: <a href="tel:166">166</a>.</div>
        </fieldset>

        <div className="field">
          <label htmlFor="note"><strong>Κάτι άλλο που θέλεις να γράψεις</strong> (προαιρετικό)</label>
          <textarea id="note" name="note" defaultValue={dec(entry?.note)} />
        </div>
        {/* Ενημέρωση πριν την αποθήκευση (απόφαση 14/10, εγκρίθηκε 15/10): ολόκληρη η καταχώριση μπορεί να τη δει η ομάδα. */}
        <p className="muted small" style={{ margin: "4px 0 10px" }}>Ό,τι γράφεις εδώ — οι απαντήσεις, η σημείωση και η νίκη σου — μπορεί να το δει ολόκληρο η ομάδα σου (οι θεραπευτές σου και η διαχείριση). Κανείς άλλος.</p>
        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </main>
  );
}
