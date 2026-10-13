import Link from "next/link";
import { memberSafety } from "@/lib/handover";
import { loadMemberActions } from "@/lib/actions";
import { RISK_INFO, RISK_LEVELS } from "@/lib/intake-rules";
import { formatDate, localParts } from "@/lib/time";
import { ActionRow, type StaffOption, type Viewer } from "./ActionRow";
import { Icon } from "./Icon";
import { Pill } from "./ui";

/**
 * Ζώνη ασφάλειας: κανόνες, όχι AI (βλ. handover-rules.ts). Ανοιχτά θέματα πρώτα, όλα ονομαστικά (τα κόκκινα δεν κρύβονται).
 *  - variant "panel" (σελίδα ατομικής): με την επόμενη ενέργεια, ποιος την αναλαμβάνει και κατάσταση.
 *  - variant "banner" (φάκελος): μία γραμμή-πλαίσιο με κουμπί «Προβολή ασφάλειας».
 */
export async function SafetyZone({ memberId, variant = "panel", viewer, staff = [], back, flags: given }: { memberId: string; variant?: "panel" | "banner"; viewer?: Viewer; staff?: StaffOption[]; back?: string; flags?: Awaited<ReturnType<typeof memberSafety>> }) {
  const flags = given ?? (await memberSafety(memberId));
  if (flags.length === 0) {
    return (
      <div className="panel" style={{ padding: "12px 16px" }}>
        <Pill tone="ok" icon="shield">Ασφάλεια</Pill> <span className="small">Κανένα ανοιχτό σήμα.</span>
        <Explain />
      </div>
    );
  }
  const red = flags.filter((f) => f.level === "red");
  const level = red.length > 0 ? "red" : "yellow";
  const linkOf = (f: (typeof flags)[number]) => (f.href === "safety" ? `/t/members/${memberId}/safety` : f.href);
  const line = (f: (typeof flags)[number], i: number) => (
    <li key={i}>
      {f.level !== "red" && <><Pill tone="yellow">Να το δεις</Pill>{" "}</>}
      {linkOf(f) ? <Link href={linkOf(f)!}>{f.text}</Link> : f.text}
      {f.at && <span className="attn-meta"> · {formatDate(localParts(f.at).date)}</span>}
    </li>
  );
  if (variant === "banner") {
    return (
      <div className={`attn banner${level === "red" ? "" : " yellow"}`} role="region" aria-label="Ενεργά θέματα ασφάλειας">
        <span className={`iconbox ${level}`}><Icon name="alert" size={20} /></span>
        <div className="attn-body">
          <div className="attn-head">
            <span className="attn-title">Ενεργά θέματα ασφάλειας</span>
            <Link className="btn outline sm" href={`/t/members/${memberId}/risk`}>Προβολή ασφάλειας</Link>
          </div>
          <ul className="lines">{flags.map(line)}</ul>
          <Explain />
        </div>
      </div>
    );
  }
  const actions = viewer ? (await loadMemberActions(memberId, "", flags, { includeAdminCare: viewer.role === "ADMIN" })).filter((a) => a.state !== "done") : [];
  const [first, ...more] = actions;
  // Πυκνή εμφάνιση: τα δύο πρώτα κόκκινα σήματα φαίνονται· τα υπόλοιπα ονομαστικά στην ανάπτυξη (όχι γενικό «+N»).
  const inline = red.slice(0, 2);
  const rest = flags.filter((f) => !inline.includes(f));
  const short = (t: string) => (t.length > 34 ? `${t.slice(0, 32)}…` : t);
  return (
    <div className={`attn${level === "red" ? "" : " yellow"}`}>
      <span className={`iconbox ${level}`}><Icon name={level === "red" ? "alert" : "info"} size={20} /></span>
      <div className="attn-body">
        <div className="attn-head">
          <span className="attn-title">Χρειάζεται προσοχή</span>
          <Pill tone={level}>{level === "red" ? "Σοβαρό σήμα" : "Να το δεις"}</Pill>
        </div>
        <ul className="lines">{(inline.length > 0 ? inline : flags.slice(0, 1)).map(line)}</ul>
        {rest.length > 0 && inline.length > 0 && (
          <details>
            <summary>Ακόμα {rest.length}: {rest.map((f) => short(f.text)).join(" · ")}</summary>
            <ul className="lines">{rest.map(line)}</ul>
          </details>
        )}
        {viewer && first && <ActionRow a={first} viewer={viewer} staff={staff} back={back ?? "/t"} compact />}
        {viewer && more.length > 0 && (
          <details>
            <summary>Άλλες ενέργειες: {more.map((a) => a.title).join(" · ")}</summary>
            {more.map((a) => <ActionRow key={a.key} a={a} viewer={viewer} staff={staff} back={back ?? "/t"} />)}
          </details>
        )}
        <Explain />
      </div>
    </div>
  );
}

// Σύντομη εξήγηση: τι σημαίνουν τα επίπεδα και τα χρώματα.
function Explain() {
  return (
    <details className="small" style={{ marginTop: 8 }}>
      <summary className="muted">Τι σημαίνουν</summary>
      <p style={{ margin: "6px 0" }}>
        Οι «ανάγκες ασφάλειας» αφορούν αυτοτραυματισμό, υποτροπή και υπερδοσολογία. Δεν είναι πρόβλεψη· λένε τι χρειάζεται το μέλος από εμάς τώρα.
      </p>
      {Object.entries(RISK_INFO).map(([k, v]) => (
        <p key={k} style={{ margin: "6px 0" }}>
          <strong>{RISK_LEVELS[k as keyof typeof RISK_LEVELS]}:</strong> {v.means} <span className="muted">→ {v.action}</span>
        </p>
      ))}
      <p className="muted" style={{ margin: "6px 0" }}>
        Σοβαρό: χρειάζεται ενέργεια σήμερα. Να το δεις: για την επόμενη επαφή. Τα σήματα βγαίνουν αυτόματα από το κόκκινο κουμπί, τα σημειώματα, τις παρουσίες και τον κλινικό φάκελο.
      </p>
    </details>
  );
}
