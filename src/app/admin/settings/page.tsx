import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
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
    groupDays: formData.getAll("groupDays").map(Number),
    groupTime: g("groupTime"),
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
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
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
            <F label="Ομάδα — ώρα"><input name="groupTime" type="time" defaultValue={s.groupTime} /></F>
            <F label="Ημερολόγιο ανάκαμψης"><input name="journalTime" type="time" defaultValue={s.journalTime} /></F>
            <F label="Ομάδα — ανοίγει λεπτά πριν"><input name="groupJoinBeforeMinutes" type="number" defaultValue={s.groupJoinBeforeMinutes} /></F>
            <F label="Ομάδα — διάρκεια (λεπτά)"><input name="groupDurationMinutes" type="number" defaultValue={s.groupDurationMinutes} /></F>
          </div>
          <F label="Φόρμες θεματικής — μέρες"><Days name="formsDays" value={s.formsDays} /></F>
          <F label="Ομάδα — μέρες"><Days name="groupDays" value={s.groupDays} /></F>
          <F label="Δωμάτιο ομάδας (πάντα το ίδιο)"><input name="groupRoomUrl" type="url" defaultValue={s.groupRoomUrl} /></F>
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
          </div>
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
          <F label="Κείμενο γραμμής βοήθειας (εμφανίζεται μαζί με το 112)">
            <textarea name="helplineText" defaultValue={s.helplineText} style={{ minHeight: 80 }} />
          </F>
        </section>

        <button className="primary big" type="submit">Αποθήκευση</button>
      </form>
    </>
  );
}
