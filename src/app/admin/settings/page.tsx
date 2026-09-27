import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";
import { DAY_NAMES } from "@/lib/time";

const numList = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[,\s]+/).filter(Boolean).map(Number);

async function save(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const g = (k: string) => String(formData.get(k) ?? "");
  const n = (k: string) => Number(formData.get(k));
  const parsed = settingsSchema.safeParse({
    appName: g("appName"),
    orgName: g("orgName"),
    logoUrl: g("logoUrl"),
    dailyTextTime: g("dailyTextTime"),
    formsDays: formData.getAll("formsDays").map(Number),
    formsTime: g("formsTime"),
    // Ομάδες: γραμμές g0…gN (μέρα, ώρα, εναλλαγή συντονιστών ανά εβδομάδα)· κενή μέρα = διαγραφή.
    groups: Array.from({ length: n("groupRows") }, (_, i) => ({
      weekday: formData.get(`g${i}_day`) === "" ? -1 : Number(formData.get(`g${i}_day`)),
      time: g(`g${i}_time`),
      rotation: [0, 1, 2, 3].map((r) => g(`g${i}_r${r}`)).filter(Boolean),
    })).filter((x) => x.weekday >= 0),
    groupRotationAnchor: g("groupRotationAnchor"),
    groupsPerCycle: n("groupsPerCycle"),
    journalFormUrl: g("journalFormUrl"),
    sessionDays: formData.getAll("sessionDays").map(Number),
    pairMinutes: n("pairMinutes"),
    changeRequestHours: n("changeRequestHours"),
    groupJoinBeforeMinutes: n("groupJoinBeforeMinutes"),
    groupDurationMinutes: n("groupDurationMinutes"),
    groupRoomUrl: g("groupRoomUrl"),
    journalTime: g("journalTime"),
    bookingDay: n("bookingDay"),
    bookingOpenTime: g("bookingOpenTime"),
    bookingCloseTime: g("bookingCloseTime"),
    sessionsPerWeek: n("sessionsPerWeek"),
    cycleLength: n("cycleLength"),
    sessionHours: numList(formData.get("sessionHours")),
    sessionMinutes: n("sessionMinutes"),
    sessionJoinBeforeMinutes: n("sessionJoinBeforeMinutes"),
    rooms: [1, 2, 3, 4].map((i) => g(`room${i}`)),
    helpEscalateMinutes: n("helpEscalateMinutes"),
    helpTalkMinutes: n("helpTalkMinutes"),
    helpMaxAlerts: n("helpMaxAlerts"),
    requireStaff2FA: formData.get("requireStaff2FA") === "on",
    helplines: [0, 1, 2, 3, 4, 5]
      .map((i) => ({ label: g(`hl${i}_label`).trim(), number: g(`hl${i}_number`).trim() }))
      .filter((l) => l.number),
    helplineText: g("helplineText"),
  });
  if (!parsed.success) redirect(`/admin/settings?e=${encodeURIComponent(parsed.error.issues.map((i) => i.path.join(".")).join(", "))}`);
  await saveSettings(parsed.data);
  redirect("/admin/settings?ok=1");
}

function Days({ name, value }: { name: string; value: number[] }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <label key={d} className="row" style={{ gap: 4, margin: 0 }}>
          <input type="checkbox" name={name} value={d} defaultChecked={value.includes(d)} style={{ width: "auto" }} />
          {DAY_NAMES[d].slice(0, 3)}
        </label>
      ))}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const [s, sp, staff] = await Promise.all([
    getSettings(),
    searchParams,
    prisma.user.findMany({ where: { role: { in: ["THERAPIST", "ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  const groupRows = [...s.groups, { weekday: -1, time: "21:00", rotation: [] as string[] }];
  return (
    <>
      <h1>Ρυθμίσεις</h1>
      {sp.ok && <div className="notice">Αποθηκεύτηκε ✓</div>}
      {sp.e && <div className="error">Έλεγξε τα πεδία: {sp.e}</div>}
      <form action={save}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Όνομα</h2>
          <div className="grid2">
            <F label="Όνομα στο κινητό (ουδέτερο)"><input name="appName" defaultValue={s.appName} required /></F>
            <F label="Διακριτικός τίτλος"><input name="orgName" defaultValue={s.orgName} required /></F>
            <F label="Λογότυπο (διεύθυνση εικόνας στο ίδιο site, π.χ. /logo.png)"><input name="logoUrl" defaultValue={s.logoUrl} /></F>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Πρόγραμμα ημέρας</h2>
          <div className="grid2">
            <F label="Κείμενο της ημέρας"><input name="dailyTextTime" type="time" defaultValue={s.dailyTextTime} /></F>
            <F label="Φόρμες θεματικής — ώρα"><input name="formsTime" type="time" defaultValue={s.formsTime} /></F>
            <F label="Ημερολόγιο ανάκαμψης"><input name="journalTime" type="time" defaultValue={s.journalTime} /></F>
            <F label="Ομάδα — ανοίγει λεπτά πριν"><input name="groupJoinBeforeMinutes" type="number" defaultValue={s.groupJoinBeforeMinutes} /></F>
            <F label="Ομάδα — διάρκεια (λεπτά)"><input name="groupDurationMinutes" type="number" defaultValue={s.groupDurationMinutes} /></F>
          </div>
          <F label="Φόρμες θεματικής — μέρες"><Days name="formsDays" value={s.formsDays} /></F>
          <F label="Δωμάτιο ομάδας (πάντα το ίδιο)"><input name="groupRoomUrl" type="url" defaultValue={s.groupRoomUrl} /></F>
          <F label="Ημερολόγιο ανάκαμψης σε Google Form (αφήστε κενό για να γίνεται μέσα στο app· {code} = κωδικός μέλους)">
            <input name="journalFormUrl" defaultValue={s.journalFormUrl} placeholder="https://docs.google.com/forms/…?entry.123={code}" />
          </F>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Ομάδες και συντονιστές</h2>
          <p className="muted small">
            Μία γραμμή ανά ομάδα. Η εναλλαγή: η 1η εβδομάδα παίρνει τον 1ο συντονιστή, η 2η τον 2ο κ.ο.κ. (π.χ. Παρασκευή: Τζίνο, Χριστιάνα).
            Για αλλαγή μίας μόνο μέρας (εκτός απροόπτου) χρησιμοποιήστε τη σελίδα «Ομάδες». Κενή μέρα = διαγραφή γραμμής.
          </p>
          <input type="hidden" name="groupRows" value={groupRows.length} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Μέρα</th><th>Ώρα</th><th>Εβδ. 1</th><th>Εβδ. 2</th><th>Εβδ. 3</th><th>Εβδ. 4</th></tr></thead>
              <tbody>
                {groupRows.map((gr, i) => (
                  <tr key={i}>
                    <td>
                      <select name={`g${i}_day`} defaultValue={gr.weekday >= 0 ? gr.weekday : ""}>
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                      </select>
                    </td>
                    <td><input name={`g${i}_time`} type="time" defaultValue={gr.time} /></td>
                    {[0, 1, 2, 3].map((r) => (
                      <td key={r}>
                        <select name={`g${i}_r${r}`} defaultValue={gr.rotation[r] ?? ""}>
                          <option value="">—</option>
                          {staff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid2">
            <F label="Αρχή μέτρησης εναλλαγής (μια Δευτέρα)"><input name="groupRotationAnchor" type="date" defaultValue={s.groupRotationAnchor} /></F>
            <F label="Ομάδες ανά κύκλο"><input name="groupsPerCycle" type="number" min={1} defaultValue={s.groupsPerCycle} /></F>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Ατομικές</h2>
          <div className="grid2">
            <F label="Μέρα κράτησης">
              <select name="bookingDay" defaultValue={s.bookingDay}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </F>
            <F label="Κρατήσεις ανοίγουν"><input name="bookingOpenTime" type="time" defaultValue={s.bookingOpenTime} /></F>
            <F label="Κρατήσεις κλείνουν"><input name="bookingCloseTime" type="time" defaultValue={s.bookingCloseTime} /></F>
            <F label="Ραντεβού την εβδομάδα"><input name="sessionsPerWeek" type="number" min={1} defaultValue={s.sessionsPerWeek} /></F>
            <F label="Συνεδρίες ανά κύκλο"><input name="cycleLength" type="number" min={1} defaultValue={s.cycleLength} /></F>
            <F label="Διάρκεια συνεδρίας (λεπτά)"><input name="sessionMinutes" type="number" min={1} defaultValue={s.sessionMinutes} /></F>
            <F label="Κουμπί ανοίγει λεπτά πριν"><input name="sessionJoinBeforeMinutes" type="number" min={0} defaultValue={s.sessionJoinBeforeMinutes} /></F>
            <F label="Ώρες ατομικών (π.χ. 10, 11, 12)"><input name="sessionHours" defaultValue={s.sessionHours.join(", ")} /></F>
            <F label="Διάρκεια Therapair (λεπτά)"><input name="pairMinutes" type="number" min={1} defaultValue={s.pairMinutes} /></F>
            <F label="Αιτήματα αλλαγής έως (ώρες πριν)"><input name="changeRequestHours" type="number" min={0} defaultValue={s.changeRequestHours} /></F>
          </div>
          <F label="Μέρες ατομικών"><Days name="sessionDays" value={s.sessionDays} /></F>
          <div className="grid2">
            {s.rooms.map((r, i) => (
              <F key={i} label={`Δωμάτιο ${i + 1} (Zoom)`}><input name={`room${i + 1}`} type="url" defaultValue={r} /></F>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Κόκκινο κουμπί</h2>
          <F label="Αν δεν το αναλάβει κανείς, ξαναστέλνεται μετά από (λεπτά)">
            <input name="helpEscalateMinutes" type="number" min={1} defaultValue={s.helpEscalateMinutes} />
          </F>
          <div className="grid2">
            <F label="Μετά την ανάληψη, «μιλήσαμε» μέσα σε (λεπτά)"><input name="helpTalkMinutes" type="number" min={1} defaultValue={s.helpTalkMinutes} /></F>
            <F label="Μέγιστες επαναλήψεις ειδοποίησης"><input name="helpMaxAlerts" type="number" min={1} defaultValue={s.helpMaxAlerts} /></F>
          </div>
          <label><strong>Γραμμές βοήθειας</strong> (φαίνονται από την αρχή στο κόκκινο κουμπί και στη σύνδεση — να επιβεβαιωθούν)</label>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="row" key={i} style={{ marginBottom: 6, flexWrap: "nowrap" }}>
              <input name={`hl${i}_number`} defaultValue={s.helplines[i]?.number ?? ""} placeholder="αριθμός" style={{ width: 110 }} />
              <input name={`hl${i}_label`} defaultValue={s.helplines[i]?.label ?? ""} placeholder="περιγραφή" />
            </div>
          ))}
          <F label="Κείμενο γραμμής βοήθειας (εμφανίζεται μαζί με το 112)">
            <textarea name="helplineText" defaultValue={s.helplineText} style={{ minHeight: 80 }} />
          </F>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Ασφάλεια</h2>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" name="requireStaff2FA" defaultChecked={s.requireStaff2FA} style={{ width: "auto" }} />
            Υποχρεωτικός δεύτερος κωδικός (2FA) για όλο το προσωπικό
          </label>
        </section>

        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </>
  );
}
