import Link from "next/link";
import { GoalWeekCard } from "./GoalWeek";
import { Icon } from "./Icon";
import { MemberGlance } from "./MemberGlance";
import { NoteText } from "./NoteText";
import { PeriodTabs } from "./PeriodTabs";
import { SinceLast } from "./SinceLast";
import { ThemeWeek } from "./ThemeWeek";
import { EmptyState } from "./ui";
import { nameWithKind } from "@/lib/access";
import type { GroupPicture, MemberPicture, SessionPicture } from "@/lib/picture";
import type { sessionGlance } from "@/lib/session-glance";
import { formatDate } from "@/lib/time";

type Glance = Awaited<ReturnType<typeof sessionGlance>>;
type Viewer = { id: string; role: string; therapistKind: string | null };
type Intake = { level: string | null; trigger: unknown; label: string };

/**
 * «Συνέχεια φροντίδας» (16/10, ανασχεδιασμός της ατομικής): ό,τι χρειάζεται ο θεραπευτής για τη συνέχεια, σε όλο το πλάτος
 * πάνω από το σημειωματάριο — όχι σε στενή στήλη. Τρεις κάρτες:
 *  1. «Προηγούμενη ατομική» (ανοιχτή, όλο το πλάτος): ημερομηνία, ποιος, τι συμφωνήθηκε, τι έμεινε ανοιχτό (τα πεδία
 *     συνέχειας, ως έχουν — χωρίς AI, χωρίς ερμηνεία) και από κάτω ΟΛΟ το σημείωμα με όλα τα πεδία (υπεύθυνη 16/10),
 *     με υδατογράφημα. Για Therapair: μόνο το σημείωμα του ίδιου μέλους (memberNotes κρύβει τον άλλον).
 *  2. «Συνέπεια»: ατομικές και ομάδες ΧΩΡΙΣΤΑ (στις ομάδες «Ήρθε / Δεν ήρθε» από το «Μπες» του μέλους, υπεύθυνη 16/10), «Εβδομάδα» ή «Μήνας» (ποτέ μαζί), με το διάστημα σε κάθε μέτρηση· χωρίς
 *     ποσοστά. Οι αριθμοί είναι αυτοί της κοινής εικόνας περιόδου (picture.ts) — ίδιοι με φάκελο και «Συνέπεια».
 *  3. «Στόχος εβδομάδας και εργασία».
 * Από κάτω «Περισσότερα για το μέλος», κλειστά: με μια ματιά (ημερολόγιο, νηφαλιότητα), από τότε ως σήμερα, θεματική,
 * σύνοψη αρχικής αξιολόγησης.
 */
export function CareContinuity({ g, memberId, viewer, intake, journalDetail, today, until, untilAt, past, extra, showTheme = true, summary, who, stacked }: {
  g: Glance; memberId: string; viewer: Viewer; intake: Intake; journalDetail: boolean; today: string; until: string; untilAt: Date; past: boolean;
  extra?: React.ReactNode; showTheme?: boolean; summary?: { author: string; text: string; canOpen: boolean } | null;
  /** Therapair: το όνομα του μέλους στον τίτλο, και οι κάρτες η μία κάτω από την άλλη (μισό πλάτος ανά μέλος). */
  who?: string; stacked?: boolean;
}) {
  return (
    <section className={`care${stacked ? " stacked" : ""}`} aria-label={who ? `Συνέχεια φροντίδας · ${who}` : "Συνέχεια φροντίδας"}>
      <h2 className="care-title">Συνέχεια φροντίδας{who && <span className="bs-who"> · {who}</span>}</h2>
      <div className="care-grid">
        <PrevSession g={g} memberId={memberId} />
        <Attendance pictures={g.pictures} past={past} memberId={memberId} />
        <section className="panel care-card" data-tour="goal" aria-labelledby={`goal-${memberId}`}>
          <h3 id={`goal-${memberId}`} className="care-h"><Icon name="target" size={18} /> Στόχος εβδομάδας και εργασία</h3>
          <p className="care-label">Στόχος της εβδομάδας · τον γράφει το μέλος στο ημερολόγιο</p>
          <GoalWeekCard detail={journalDetail} memberId={memberId} date={today} />
          <p className="care-label">Τελευταία εργασία</p>
          {g.assignment ? (
            <Link className="linkrow" href={`/t/members/${memberId}/assignments`}>
              <span className="iconbox"><Icon name="doc" /></span>
              <span className="grow"><div>{g.assignment.title}</div><div className="hint">{g.assignment.answered ? "Έχει απαντήσει" : g.assignment.length ? "Σε εξέλιξη" : "Δεν ξεκίνησε"}</div></span>
              <span className="arrow"><Icon name="chevron" /></span>
            </Link>
          ) : <p className="hint care-empty">Δεν έχει σταλεί εργασία.</p>}
        </section>
      </div>

      <div className="care-more" aria-label="Περισσότερα για το μέλος">
        <details className="side-fold" data-tour="glance">
          <summary><span className="iconbox"><Icon name="list" size={16} /></span>Με μια ματιά · ημερολόγιο και νηφαλιότητα</summary>
          <div className="side-body">
            {past && <p className="hint" style={{ margin: "0 0 8px" }}>όπως είναι σήμερα, όχι τότε</p>}
            <MemberGlance g={g} intake={intake} viewer={viewer} compact memberId={memberId} />
          </div>
        </details>
        {g.prev && (
          <details className="side-fold" data-tour="since">
            <summary><span className="iconbox"><Icon name="clock" size={16} /></span>Από την προηγούμενη ατομική ως σήμερα</summary>
            <div className="side-body">
              <SinceLast journalDetail={journalDetail} memberId={memberId} prev={g.prev} until={until} untilAt={untilAt} compact />
            </div>
          </details>
        )}
        {showTheme && (
          <details className="side-fold">
            <summary><span className="iconbox"><Icon name="folder" size={16} /></span>Θεματική της εβδομάδας</summary>
            <div className="side-body"><ThemeWeek forms={g.theme.forms} dailyText={g.theme.dailyText} compact /></div>
          </details>
        )}
        {summary && (
          <details className="side-fold">
            <summary><span className="iconbox"><Icon name="user" size={16} /></span>Σύνοψη από την αρχική αξιολόγηση</summary>
            <div className="side-body">
              <p className="muted small" style={{ margin: "0 0 6px" }}>{summary.author}</p>
              <div className="body-text wm">{summary.text}</div>
              {summary.canOpen && <Link className="small" href={`/t/members/${memberId}/assessment`}>Όλη η αξιολόγηση ›</Link>}
            </div>
          </details>
        )}
        {extra}
      </div>
    </section>
  );
}

/** «Προηγούμενη ατομική»: μόνο ό,τι γράφτηκε στο σημείωμα. */
function PrevSession({ g, memberId }: { g: Glance; memberId: string }) {
  const p = g.prev;
  if (!p) {
    return (
      <section className="panel care-card care-prev" data-tour="open" aria-labelledby={`prev-${memberId}`}>
        <h3 id={`prev-${memberId}`} className="care-h"><Icon name="doc" size={18} /> Προηγούμενη ατομική</h3>
        <EmptyState>Δεν υπάρχει προηγούμενη ατομική καταγεγραμμένη.</EmptyState>
      </section>
    );
  }
  const h = p.handover;
  const prevSafety = p.safety.safeOk === false || Boolean(p.safety.concern) || p.usedSince === "YES";
  // «Τι προτείναμε» (παλιό πεδίο) δεν παρουσιάζεται ως συμφωνία του μέλους (απόφαση 13/10): χωριστή γραμμή.
  const suggested = h.suggested || (!h.agreed ? p.next : "");
  return (
    <details className="panel care-card care-prev" open data-tour="open">
      <summary className="care-sum">
        <h3 id={`prev-${memberId}`} className="care-h"><Icon name="doc" size={18} /> Προηγούμενη ατομική</h3>
        <span className="care-meta">{formatDate(p.date)} · {nameWithKind(p.by, p.byKind)}{p.pair ? " · Therapair" : ""}</span>
      </summary>
      {prevSafety && (
        <div className="attn yellow wm care-prev-safety" data-tour="prev-safety">
          <span className="iconbox yellow"><Icon name="alert" size={18} /></span>
          <div className="attn-body small">
            {p.safety.safeOk === false && <div><strong>Ανησυχία για την ασφάλεια στο προηγούμενο σημείωμα:</strong> {p.safety.safetyText || "βλ. προβληματισμό"}</div>}
            {p.usedSince === "YES" && <div><strong>Χρήση από την προηγούμενη επαφή:</strong> ναι (κατά το προηγούμενο σημείωμα)</div>}
            {p.safety.concern && <div><strong>Προβληματισμός προς την ομάδα:</strong> {p.safety.concern}</div>}
          </div>
        </div>
      )}
      {/* Συνέχεια πρώτα (τονισμένη)· από κάτω ΟΛΟ το σημείωμα, όπως γράφτηκε (υπεύθυνη 16/10: «η σύνοψη θα έχει όλα τα
          δεδομένα»). Τίποτα δεν παράγεται ή συμπεραίνεται — μόνο ό,τι καταγράφηκε, με υδατογράφημα. */}
      <dl className="care-dl care-key wm">
        <dt>Συμφωνήθηκε ως επόμενο βήμα</dt>
        <dd>{h.agreed || <span className="muted">Δεν καταγράφηκε.</span>}</dd>
        <dt>Έμεινε ανοιχτό</dt>
        <dd>{h.openIssues || <span className="muted">Δεν καταγράφηκε.</span>}</dd>
        {h.handover && <><dt>Για τον επόμενο θεραπευτή</dt><dd>{h.handover}</dd></>}
        {suggested && <><dt>Τι προτείναμε</dt><dd>{suggested}</dd></>}
      </dl>
      <section className="care-full" aria-label="Όλο το προηγούμενο σημείωμα">
        <h4 className="care-full-h">Όλο το σημείωμα</h4>
        {p.text.trim() ? <NoteText text={p.text} /> : <p className="muted">Το σημείωμα δεν έχει κείμενο.</p>}
      </section>
      <p className="hint care-foot"><Link href={`/t/members/${memberId}/notes`}>Όλα τα σημειώματα στον φάκελο ›</Link></p>
    </details>
  );
}

/** Ατομικές και ομάδες χωριστά, για ΜΙΑ περίοδο τη φορά (Εβδομάδα ή Μήνας). Χωρίς ποσοστά. */
function Attendance({ pictures, past, memberId }: { pictures: { week: MemberPicture; month: MemberPicture }; past: boolean; memberId: string }) {
  return (
    <section className="panel care-card" aria-labelledby={`att-${memberId}`} data-tour="attendance">
      <h3 id={`att-${memberId}`} className="care-h"><Icon name="chart" size={18} /> Συνέπεια ατομικών και ομάδων</h3>
      {past && <p className="hint" style={{ margin: "0 0 8px" }}>όπως είναι σήμερα, όχι τότε</p>}
      <PeriodTabs
        weekLabel={pictures.week.period.label}
        monthLabel={pictures.month.period.label}
        week={<Counts pic={pictures.week} />}
        month={<Counts pic={pictures.month} />}
      />
    </section>
  );
}

function Counts({ pic }: { pic: MemberPicture }) {
  const { sessions: s, groups: g, period } = pic;
  return (
    <div className="att">
      <SessionRow s={s} period={period.label} />
      <GroupRow g={g} period={period.label} />
      {period.clippedFrom && <p className="hint att-note">Μετρά από την έναρξη του προγράμματος.</p>}
    </div>
  );
}

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
const Sub = ({ parts }: { parts: (string | false)[] }) => {
  const p = parts.filter(Boolean);
  return p.length ? <p className="hint att-sub">{p.join(" · ")}</p> : null;
};

function SessionRow({ s, period }: { s: SessionPicture; period: string }) {
  return (
    <div className="att-row">
      <div className="att-name"><strong>Ατομικές</strong> <span className="hint">(και Therapair) · {period}</span></div>
      {s.passed === 0 ? (
        <p className="att-none">{s.scheduled > 0 ? "Καμία δεν έχει περάσει ακόμα." : "Καμία προγραμματισμένη."}</p>
      ) : (
        <ul className="att-counts">
          <li><b>{s.present}</b> {s.present === 1 ? "παρουσία" : "παρουσίες"}</li>
          <li><b>{s.absent}</b> «Δεν ήρθε»</li>
          <li><b>{s.noRecord}</b> χωρίς καταγραφή <span className="hint">(εκκρεμεί — δεν είναι απουσία)</span></li>
        </ul>
      )}
      <Sub parts={[
        s.passed > 0 && `από ${plural(s.passed, "που πέρασε", "που πέρασαν")}`,
        s.inProgress > 0 && `${s.inProgress} σε εξέλιξη`,
        s.upcoming > 0 && plural(s.upcoming, "επόμενη", "επόμενες"),
        s.cancelled > 0 && `${plural(s.cancelled, "ακυρώθηκε", "ακυρώθηκαν")} (δεν μετρά)`,
        s.moved > 0 && `${plural(s.moved, "μεταφέρθηκε", "μεταφέρθηκαν")} (μετρά στη νέα ημερομηνία)`,
        s.target !== null && `στόχος μήνα ${s.target}`,
      ]} />
    </div>
  );
}

function GroupRow({ g, period }: { g: GroupPicture; period: string }) {
  return (
    <div className="att-row">
      <div className="att-name"><strong>Ομάδες</strong> <span className="hint">· {period}</span></div>
      {g.passed === 0 ? (
        <p className="att-none">{g.scheduled > 0 ? "Καμία δεν έχει περάσει ακόμα." : "Καμία στο πρόγραμμα."}</p>
      ) : (
        <ul className="att-counts">
          <li><b>{g.present}</b> {g.present === 1 ? "παρουσία" : "παρουσίες"}</li>
          <li><b>{g.noRecord}</b> «Δεν ήρθε» <span className="hint">(δεν πάτησε «Μπες»)</span></li>
        </ul>
      )}
      <Sub parts={[
        g.passed > 0 && `από ${plural(g.passed, "που πέρασε", "που πέρασαν")}`,
        g.passed > 0 && "στις ομάδες «Ήρθε / Δεν ήρθε» βγαίνει από το «Μπες στην ομάδα» του μέλους",
        g.notHeld > 0 && `${g.notHeld} δεν ${g.notHeld === 1 ? "έγινε" : "έγιναν"} (δεν μετρά)`,
        g.upcoming > 0 && plural(g.upcoming, "επόμενη", "επόμενες"),
        g.target !== null && `στόχος μήνα ${g.target}`,
      ]} />
    </div>
  );
}
