import Link from "next/link";
import { type ActionView } from "@/lib/actions-core";
import { formatDate, localParts } from "@/lib/time";
import { ActionRow, type StaffOption, type Viewer } from "./ActionRow";
import { Icon } from "./Icon";
import { Pill } from "./ui";

export type Issue = { text: string; at?: Date | null; href?: string; by?: string; red: boolean };

const day = (d?: Date | null) => (d ? formatDate(localParts(d).date) : "");

/**
 * «Χρειάζεται προσοχή» για ένα μέλος: σύντομος τίτλος (το όνομα), το βασικό ζήτημα με ημερομηνία,
 * η επόμενη ενέργεια με κατάσταση και κουμπιά, και οι δευτερεύουσες λεπτομέρειες σε ανάπτυξη.
 * Όλα τα κόκκινα σήματα φαίνονται ονομαστικά· δεν κρύβονται σε γενικό «+1 ακόμα». Διακριτικός τόνος, όχι μεγάλη κόκκινη επιφάνεια.
 */
export function AttentionCard({ memberId, memberName, issues, actions, viewer, staff, back }: { memberId: string; memberName: string; issues: Issue[]; actions: ActionView[]; viewer: Viewer; staff: StaffOption[]; back: string }) {
  const red = issues.filter((i) => i.red);
  const other = issues.filter((i) => !i.red);
  const top = issues[0];
  const level = red.length > 0 ? "red" : "yellow";
  const [firstAction, ...moreActions] = actions;
  const secondaryRed = red.slice(1);
  const restIssues = [...red.slice(2), ...other];
  const short = (t: string) => (t.length > 34 ? `${t.slice(0, 32)}…` : t);
  return (
    <div className={`attn${level === "red" ? "" : " yellow"}`}>
      <span className={`iconbox ${level}`}><Icon name={level === "red" ? "alert" : "info"} size={20} /></span>
      <div className="attn-body">
        <div className="attn-head">
          <span className="attn-title"><Link href={`/t/members/${memberId}`}>{memberName}</Link></span>
          <Pill tone={level}>{level === "red" ? "Σοβαρό σήμα" : "Να το δεις"}</Pill>
        </div>
        {top && (
          <p className="attn-main">
            {top.href ? <Link href={top.href}>{top.text}</Link> : top.text}
            <span className="attn-meta">{top.at ? ` · ${day(top.at)}` : ""}{top.by ? ` · ${top.by}` : ""}</span>
          </p>
        )}
        {secondaryRed.length > 0 && (
          <ul className="lines">
            {secondaryRed.slice(0, 1).map((i, k) => (
              <li key={k}>{i.href ? <Link href={i.href}>{i.text}</Link> : i.text}<span className="attn-meta">{i.at ? ` · ${day(i.at)}` : ""}</span></li>
            ))}
          </ul>
        )}
        {firstAction && <ActionRow a={firstAction} viewer={viewer} staff={staff} back={back} compact />}
        {(restIssues.length > 0 || moreActions.length > 0) && (
          <details>
            <summary>
              {restIssues.length > 0 && <>Ακόμα {restIssues.length}: {restIssues.map((i) => short(i.text)).join(" · ")}</>}
              {restIssues.length > 0 && moreActions.length > 0 && " — "}
              {moreActions.length > 0 && <>Άλλες ενέργειες: {moreActions.map((a) => a.title).join(" · ")}</>}
            </summary>
            {restIssues.length > 0 && (
              <ul className="lines">
                {restIssues.map((i, k) => <li key={k}>{i.href ? <Link href={i.href}>{i.text}</Link> : i.text}<span className="attn-meta">{i.at ? ` · ${day(i.at)}` : ""}{i.by ? ` · ${i.by}` : ""}</span></li>)}
              </ul>
            )}
            {moreActions.map((a) => <ActionRow key={a.key} a={a} viewer={viewer} staff={staff} back={back} />)}
          </details>
        )}
      </div>
    </div>
  );
}
