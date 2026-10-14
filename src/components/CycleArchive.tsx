import Link from "next/link";
import type { CycleSummaryData, cyclePicture } from "@/lib/cycle-review";
import { describeGroups } from "@/lib/group-presence";
import { describeCounts, describeSources, PRESENCE_LABEL } from "@/lib/presence";
import { formatDate } from "@/lib/time";

type Pic = Awaited<ReturnType<typeof cyclePicture>>;

/**
 * Η αυτόματη σύνοψη ενός κύκλου (απόφαση 14/10): μαζεύεται μόνη της — παρουσίες, ομάδες, απογραφές, σημειώματα, εργασίες,
 * θεματικές, μέρες που δεν ήρθε, μέρες με επιθυμία, χρήση — χωρίς ερμηνεία και χωρίς AI. Η ίδια όψη για τον ανοιχτό κύκλο
 * και για το αρχειοθετημένο στιγμιότυπο (όπως ήταν τη στιγμή του κλεισίματος).
 * journalDetail: τα κείμενα του ημερολογίου (νίκες) μόνο στη διαχείριση.
 */
export function CycleArchive({ pic, data, note, journalDetail, links = true }: { pic: Pic; data: CycleSummaryData; note?: string; journalDetail: boolean; links?: boolean }) {
  const row = (label: string, value: string, warn = false) => (
    <div className="row spread" style={{ flexWrap: "nowrap" }}><span className="muted">{label}</span><strong style={warn ? { color: "var(--red)" } : undefined}>{value}</strong></div>
  );
  const d = data;
  return (
    <div className="stack">
      <div className="card stack">
        {row("Ατομικές", `${describeCounts(pic.presence) || "—"} · ο κύκλος προβλέπει ${pic.sessions.total}`, pic.presence.noRecord > 0 || pic.presence.confirmedAbsent > 0)}
        {pic.presence.counted > 0 && row("Πηγή παρουσίας", describeSources(pic.presence))}
        {row("Ομάδες", `${describeGroups({ counted: pic.groups.came, passed: pic.groups.passed, noRecord: pic.groups.noRecord })} · ο κύκλος προβλέπει ${pic.groups.total}`, pic.groups.noRecord > 0)}
        {row("Απογραφές", `${pic.journal.written} από ${pic.journal.days} μέρες`)}
        {row("Κόκκινο κουμπί", String(pic.help), pic.help > 0)}
        {row("Νηφαλιότητα", pic.soberDays !== null ? `${pic.soberDays} μέρες${pic.relapses ? ` · ${pic.relapses} ${pic.relapses === 1 ? "αλλαγή" : "αλλαγές"} ημερομηνίας στον κύκλο` : ""}` : "—", pic.relapses > 0)}
        {row("Θεματικές που δουλέψαμε", d.worked.themes.length ? d.worked.themes.join(" · ") : "—")}
        {row("Μέρες που δεν ήρθε σε ατομική", d.participation.missed.length ? d.participation.missed.map((m) => `${formatDate(m.date)} (${PRESENCE_LABEL[m.state as keyof typeof PRESENCE_LABEL]?.word ?? m.state})`).join(", ") : "καμία", d.participation.missed.length > 0)}
        {row("Μέρες με επιθυμία (λαχτάρα ≥ 6/10)", d.recorded.cravingDays.length ? d.recorded.cravingDays.map((c) => `${formatDate(c.date)} (${c.craving})`).join(", ") : "καμία", d.recorded.cravingDays.length > 0)}
        {row("Έγραψε ότι έκανε χρήση", d.recorded.usedDays.length ? d.recorded.usedDays.map(formatDate).join(", ") : "όχι", d.recorded.usedDays.length > 0)}
        {d.recorded.selfHarmDays.length > 0 && row("Σκέψεις να κάνει κακό στον εαυτό του", d.recorded.selfHarmDays.map(formatDate).join(", "), true)}
        {row("Μέσοι όροι ημερολογίου", `διάθεση ${d.recorded.mood ?? "—"}/10 · λαχτάρα ${d.recorded.craving ?? "—"}/10 · ύπνος ${d.recorded.sleep ?? "—"} ώρες`)}
      </div>
      <details className="card small fold">
        <summary>Στόχοι εβδομάδας <span className="muted">· {pic.weeks.length}</span></summary>
        {pic.weeks.length === 0 ? <p className="muted">Δεν έβαλε στόχους σε αυτόν τον κύκλο.</p> : (
          <div className="list">{pic.weeks.map((w) => <div key={w.week} style={{ display: "block" }}><div className="sub">Εβδομάδα {formatDate(w.week)}</div><div>«{w.text}»</div><div className="small muted">Ναι {w.yes} · Λίγο {w.partly} · Όχι {w.no}</div></div>)}</div>
        )}
      </details>
      <details className="card small fold">
        <summary>Τι δουλέψαμε <span className="muted">· {d.worked.notes.length} σημειώματα, {d.worked.assignments.length} εργασίες</span></summary>
        <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
          {d.worked.notes.map((n) => <li key={n.slotId}>{links ? <Link href={`/t/s/${n.slotId}`}>{formatDate(n.date)}</Link> : formatDate(n.date)} · {n.therapist}{n.pair && " · Therapair"}{n.handover.suggested && <> · προτάθηκε: {n.handover.suggested}</>}</li>)}
          {d.worked.assignments.map((a) => <li key={a.id}>Εργασία{a.step ? ` (Βήμα ${a.step})` : ""}: {a.title} · {a.answered ? "απάντησε" : "δεν απάντησε"}</li>)}
          {d.worked.notes.length + d.worked.assignments.length === 0 && <li className="muted">Καμία καταγραφή στην περίοδο.</li>}
        </ul>
      </details>
      <details className="card small fold">
        <summary>Συμμετοχή ανά ατομική <span className="muted">· με πηγή</span></summary>
        <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
          {d.participation.sessions.map((x, i) => <li key={i}>{formatDate(x.date)} · {x.kind}{x.therapist && ` · ${x.therapist}`} · <strong>{PRESENCE_LABEL[x.state as keyof typeof PRESENCE_LABEL]?.word ?? x.state}</strong> <span className="muted">({x.source})</span>{x.hasNote ? " · σημείωμα ✓" : " · χωρίς σημείωμα"}</li>)}
        </ul>
      </details>
      {journalDetail && d.recorded.wins.length > 0 && (
        <details className="card small fold"><summary>Νίκες (ημερολόγιο) <span className="muted">· μόνο διαχείριση</span></summary>
          <ul style={{ margin: "8px 0", paddingLeft: 18 }}>{d.recorded.wins.map((w) => <li key={w.date}>«{w.text}» ({formatDate(w.date)})</li>)}</ul>
        </details>
      )}
      <details className="card small fold">
        <summary>Τι χρειάζεται συνέχεια <span className="muted">· από το τελευταίο σημείωμα</span></summary>
        {d.next.from ? (
          <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
            {d.next.from.handover.agreed && <li>Συμφωνήθηκε ως επόμενο βήμα: {d.next.from.handover.agreed}</li>}
            {d.next.from.handover.openIssues && <li>Έμεινε ανοιχτό: {d.next.from.handover.openIssues}</li>}
            {d.next.from.handover.handover && <li>Για τον επόμενο θεραπευτή: {d.next.from.handover.handover}</li>}
            {d.next.from.handover.suggested && <li>Τι προτείναμε: {d.next.from.handover.suggested}</li>}
            <li className="muted">{formatDate(d.next.from.date)} · {d.next.from.therapist}</li>
          </ul>
        ) : <p className="muted">Δεν υπάρχει σημείωμα στον κύκλο.</p>}
      </details>
      {note && <div className="card"><div className="muted small">Κάτι επιπλέον (γράφτηκε στο κλείσιμο)</div><div className="body-text wm">{note}</div></div>}
    </div>
  );
}
