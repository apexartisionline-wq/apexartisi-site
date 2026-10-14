import Link from "next/link";
import {
  describeGroupPicture, describeGroupScheduled, describeJournal, describeJournalAvg, describePct, describeScheduled, describeSessionSources, describeSessions,
  SESSION_WORD, shortDate, type MemberPicture,
} from "@/lib/picture";
import { GROUP_LABEL } from "@/lib/group-presence";
import { formatDate, formatTime, localParts } from "@/lib/time";

/**
 * Η εικόνα μιας περιόδου (14/10): τρεις χωριστές εικόνες — ατομικές, ομάδες, ημερολόγιο — και η νηφαλιότητα με την πηγή της.
 * Κάθε αριθμός και κάθε φράση βγαίνουν από το ΙΔΙΟ αντικείμενο (src/lib/picture.ts), ώστε να μη διαφωνούν ποτέ.
 * Χωρίς ελεύθερο κείμενο του μέλους: το ημερολόγιο εδώ είναι μόνο αριθμοί (οι ημέρες ανοίγουν στη σελίδα «Απογραφές»).
 */
export function PicturePanel({ pic, journalHref, consistencyHref, compact, canOpenDays = true }: { pic: MemberPicture; journalHref?: string; consistencyHref?: string; compact?: boolean; canOpenDays?: boolean }) {
  const { period, sessions: s, groups: g, journal: j, sober } = pic;
  const frac = (present: number, passed: number) => (passed === 0 ? "—" : `${present}/${passed}`);
  const q = period.kind === "month" ? "p=month" : "p=week";
  return (
    <div className={`pic${compact ? " compact" : ""}`}>
      <p className="pic-period">
        {period.label}
        {period.clippedFrom && <> · μετρά από {shortDate(period.clippedFrom)} (έναρξη προγράμματος)</>}
      </p>

      <section className="pic-block" aria-label="Ατομικές">
        <div className="pic-head"><b className="pic-big">{frac(s.present, s.passed)}</b><span><strong>Ατομικές</strong> <span className="hint">(και Therapair) · παρουσίες / που πέρασαν</span></span></div>
        <p className="pic-line">{describeScheduled(s)}</p>
        <p className="pic-line">{describeSessions(s)}</p>
        {(describePct(s) || describeSessionSources(s)) && (
          <p className="hint pic-sub">{describePct(s)}{describePct(s) && describeSessionSources(s) ? " · " : ""}{describeSessionSources(s) && `πηγή: ${describeSessionSources(s)}`}</p>
        )}
        {!compact && (s.items.length > 0 || s.cancelled > 0 || s.moved > 0) && (
          <details className="fold small">
            <summary>Κάθε ατομική της περιόδου</summary>
            <ul className="pic-list">
              {s.items.map((x) => (
                <li key={x.id}><span>{formatDate(x.date)}, {formatTime(x.startsAt)} · {x.pair ? "Therapair" : "ατομική"}{x.therapist ? ` · ${x.therapist}` : ""}</span><b>{SESSION_WORD[x.state]}</b>{x.joinedAt && x.state !== "present_join" && <span className="hint"> · πάτημα «Μπες» {formatTime(x.joinedAt)} (στο ιστορικό)</span>}</li>
              ))}
              {s.cancelledItems.map((x, i) => (
                <li key={`c${i}`} className="muted"><span>{formatDate(x.date)}, {formatTime(x.startsAt)} · {x.pair ? "Therapair" : "ατομική"}</span><b>ακυρώθηκε</b><span className="hint"> · {x.reason || "ακύρωση"} · {x.by}, {formatDate(localParts(x.at).date)} — δεν μετρά</span></li>
              ))}
              {s.movedItems.map((x, i) => (
                <li key={`m${i}`} className="muted"><span>{formatDate(x.date)}, {formatTime(x.startsAt)}</span><b>μεταφέρθηκε</b><span className="hint"> · στις {formatDate(x.toDate)} {formatTime(x.toStartsAt)} · {x.by} — μετρά στη νέα ημερομηνία</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="pic-block" aria-label="Ομάδες">
        <div className="pic-head"><b className="pic-big">{frac(g.present, g.passed)}</b><span><strong>Ομάδες</strong> <span className="hint">· παρουσίες / που πέρασαν</span></span></div>
        <p className="pic-line">{describeGroupScheduled(g)}</p>
        <p className="pic-line">{describeGroupPicture(g)}</p>
        {describePct(g) && <p className="hint pic-sub">{describePct(g)}</p>}
        {!compact && g.items.length > 0 && (
          <details className="fold small">
            <summary>Κάθε ομάδα της περιόδου</summary>
            <ul className="pic-list">
              {g.items.map((x) => <li key={`${x.date} ${x.time}`}><span>{formatDate(x.date)}, {x.time}</span><b>{GROUP_LABEL[x.state]}</b></li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="pic-block" aria-label="Ημερολόγιο ανάκαμψης">
        <div className="pic-head"><b className="pic-big">{j.days === 0 ? "—" : `${j.written}/${j.days}`}</b><span><strong>Ημερολόγιο</strong> <span className="hint">(απογραφές) · καταχωρίσεις / ημέρες</span></span></div>
        <p className="pic-line">{describeJournal(j)}</p>
        <p className="pic-line">{describeJournalAvg(j)}</p>
        {(j.used.length > 0 || j.selfHarm.length > 0 || j.topCraving) && (
          <p className="warn-text small pic-sub">
            {j.used.length > 0 && <>Έγραψε ότι έκανε χρήση: {j.used.map(shortDate).join(", ")}. </>}
            {j.selfHarm.length > 0 && <>Σκέψεις να κάνει κακό στον εαυτό του: {j.selfHarm.map(shortDate).join(", ")}. </>}
            {j.topCraving && <>Πιο δυνατή λαχτάρα: {j.topCraving.value}/10 ({shortDate(j.topCraving.date)}).</>}
          </p>
        )}
        {(j.goal.YES + j.goal.PARTLY + j.goal.NO > 0) && <p className="hint pic-sub">Στόχος εβδομάδας: Ναι {j.goal.YES} · Λίγο {j.goal.PARTLY} · Όχι σήμερα {j.goal.NO}</p>}
        {journalHref && canOpenDays && <p className="hint pic-sub"><Link href={`${journalHref}?${q}`}>Οι ημέρες, μία-μία ›</Link></p>}
      </section>

      <section className="pic-block" aria-label="Νηφαλιότητα">
        <div className="pic-head"><b className="pic-big">{sober.days ?? "—"}</b><span><strong>Νηφαλιότητα</strong> <span className="hint">· μέρες</span></span></div>
        <p className="pic-line">
          {sober.since ? <>Από {formatDate(sober.since)} · πηγή: φάκελος{sober.setBy ? <> — {sober.setWhy ? `${sober.setWhy}, ` : ""}{sober.setBy}, {formatDate(localParts(sober.setAt!).date)}{sober.previous ? ` (πριν: ${formatDate(sober.previous)})` : ""}</> : ", χωρίς καταγραφή αλλαγής"}</> : "Δεν έχει καταγραφεί ημερομηνία νηφαλιότητας στον φάκελο."}
        </p>
      </section>

      {consistencyHref && <p className="hint pic-sub"><Link href={`${consistencyHref}?${q}`}>Συνέπεια όλων ›</Link></p>}
    </div>
  );
}
