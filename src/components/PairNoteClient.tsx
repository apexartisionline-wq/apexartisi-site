"use client";

import { useEffect, useState } from "react";
import { JOURNALING, PRESENTED } from "@/lib/note-form";
import { ACCEPTED_HELP, CONNECTED, findOther, nameVariants, type PairSide, pairSideSchema, STANCE } from "@/lib/pair-note";
import { vocative } from "@/lib/vocative";

type Member = { id: string; name: string };
type Props = {
  action: (formData: FormData) => void;
  slotId: string;
  members: [Member, Member];
  initial: Record<string, Partial<PairSide>>;
  themeForms: string[];
  version: string; // πότε άλλαξε τελευταία φορά (για να μη σβήσει κάποιος αλλαγή άλλης συσκευής)
};

const fresh = (): Partial<PairSide> => ({ came: true, sober: true, safeOk: true, notify: false });

// Σημειωματάριο Therapair: κάθε ερώτηση με τα δύο ονόματα δίπλα-δίπλα (στο κινητό το ένα κάτω από το άλλο).
// Αποθηκεύεται ως ξεχωριστό σημείωμα στον φάκελο του καθενός.
export function PairNoteClient({ action, slotId, members, initial, themeForms, version }: Props) {
  const [m1, m2] = members;
  const [d, setD] = useState<Record<string, Partial<PairSide>>>({
    [m1.id]: { ...fresh(), ...initial[m1.id] },
    [m2.id]: { ...fresh(), ...initial[m2.id] },
  });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof PairSide>(id: string, k: K, v: PairSide[K]) => {
    setTouched(true);
    setD((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  };
  const toggleIn = (id: string, k: "presented" | "emerged", v: string) => {
    const cur = (d[id][k] as string[] | undefined) ?? [];
    set(id, k, (cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v]) as never);
  };
  const notifyOf = (s: Partial<PairSide>) => Boolean(s.notify || s.safeOk === false || s.concern?.trim());

  // Πρόχειρο στην καρτέλα (όπως στην ατομική): αν πέσει η σύνδεση, το σημειωματάριο ξαναβρίσκεται.
  const draftKey = `pair-draft:${slotId}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        setD(JSON.parse(raw));
        setRestored(true);
      }
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    if (!touched) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(d));
    } catch {}
  }, [d, draftKey, touched]);

  const [problem, setProblem] = useState("");
  // Πριν την αποθήκευση: αν βρεθεί το όνομα του άλλου στο κείμενο του ενός, το λέμε στον θεραπευτή
  // (με το δεύτερο πάτημα αλλάζει αυτόματα σε «το άλλο μέλος»).
  const [warned, setWarned] = useState("");
  const TEXTS = [["presentedText", "Πώς παρουσιάστηκε"], ["emergedText", "Τι εμφανίστηκε"], ["outcome", "Τι βγήκε"], ["positives", "Τα θετικά"], ["suggested", "Τι προτείναμε"], ["concern", "Προβληματισμός"]] as const;
  const nameHits = () => {
    const hits: string[] = [];
    for (const m of members) {
      const other = members.find((o) => o.id !== m.id)!;
      for (const [k, label] of TEXTS) {
        const words = findOther(String(d[m.id][k] ?? ""), nameVariants(other.name, vocative));
        if (words.length) hits.push(`στο «${label}» (${first(m)}): ${words.join(", ")}`);
      }
    }
    return hits;
  };
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    let msg = "";
    for (const m of members) {
      const r = pairSideSchema.safeParse({ ...d[m.id], notify: notifyOf(d[m.id]) });
      if (!r.success) {
        msg = `${m.name.split(" ")[0]}: ${r.error.issues[0]?.message ?? "κάτι λείπει."}`;
        break;
      }
    }
    if (!msg && !navigator.onLine) msg = "Δεν υπάρχει σύνδεση στο ίντερνετ· πάτα ξανά μόλις επανέλθει.";
    if (!msg) {
      const hits = nameHits().join(" · ");
      if (hits && hits !== warned) {
        setWarned(hits);
        msg = `Βρέθηκε το όνομα του άλλου μέλους ${hits}. Άλλαξέ το σε «το άλλο μέλος» — ή πάτα ξανά «Αποθήκευση» και θα αλλάξει αυτόματα.`;
      }
    }
    setProblem(msg);
    if (msg) e.preventDefault();
  };

  const first = (m: Member) => m.name.split(" ")[0];
  // Μία ερώτηση, δύο στήλες: μία για κάθε μέλος.
  const both = (render: (m: Member) => React.ReactNode) => (
    <div className="pair-grid">
      {members.map((m) => (
        <div key={m.id} className="pair-col">
          <div className="pair-name">{first(m)}</div>
          {render(m)}
        </div>
      ))}
    </div>
  );
  const chips = (m: Member, k: "connected" | "acceptedHelp" | "stance", opts: readonly string[]) => (
    <div className="chips">
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={d[m.id][k] === o} onClick={() => set(m.id, k, (d[m.id][k] === o ? undefined : o) as never)}>{o}</button>
      ))}
    </div>
  );
  const multi = (m: Member, k: "presented" | "emerged", opts: readonly string[]) => (
    <div className="chips">
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={((d[m.id][k] as string[] | undefined) ?? []).includes(o)} onClick={() => toggleIn(m.id, k, o)}>{o}</button>
      ))}
    </div>
  );
  const journalChips = (m: Member) => (
    <div className="chips">
      {JOURNALING.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={d[m.id].journaling === o} onClick={() => set(m.id, "journaling", (d[m.id].journaling === o ? undefined : o) as never)}>{o}</button>
      ))}
    </div>
  );
  const text = (m: Member, k: "presentedText" | "emergedText" | "outcome" | "positives" | "suggested" | "concern", label: string, ph = "", rows = 2) => (
    <textarea aria-label={`${label} — ${first(m)}`} placeholder={ph} rows={rows} style={{ minHeight: rows * 24 + 20, marginTop: 8 }} value={(d[m.id][k] as string | undefined) ?? ""} onChange={(e) => set(m.id, k, e.target.value as never)} />
  );
  const sw = (m: Member, k: "came" | "sober" | "safeOk" | "notify", label: string) => {
    const on = k === "notify" ? notifyOf(d[m.id]) : Boolean(d[m.id][k]);
    return (
      <div className="row spread" style={{ flexWrap: "nowrap", marginTop: 6 }}>
        <span>{label}</span>
        <button type="button" role="switch" aria-checked={on} aria-label={`${label} — ${first(m)}`} className="switch" onClick={() => set(m.id, k, !on as never)} />
      </div>
    );
  };

  // Κάθε ερώτηση κλείνει όταν γεμίσει (λιγότερη κύλιση στη μέση της συνεδρίας).
  const filled = (k: keyof PairSide) => members.every((m) => { const v = d[m.id][k]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""; });
  // Απλή συνάρτηση (όχι component), ώστε τα πεδία να μη χάνουν τον κέρσορα όσο γράφεις.
  const sec = (title: string, done: boolean, children: React.ReactNode) => (
    <details className="pair-sec" open key={title}>
      <summary>{title}{done && <span className="muted small"> ✓</span>}</summary>
      {children}
    </details>
  );

  return (
    <form action={action} onSubmit={check} className="note-form">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="payload" value={JSON.stringify(Object.fromEntries(members.map((m) => [m.id, { ...d[m.id], notify: notifyOf(d[m.id]) }])))} />
      {restored && <div className="notice">Βρέθηκε πρόχειρο που δεν είχε αποθηκευτεί — συνέχισε από εκεί.</div>}
      <p className="muted small" style={{ marginTop: 0 }}>
        Κάθε μέλος παίρνει <strong>δικό του σημείωμα</strong> στον φάκελό του. Στο κείμενο του ενός γράψε «το άλλο μέλος» — αν ξεφύγει όνομα, γράφεται αυτόματα «το άλλο μέλος».
      </p>

      <fieldset>{both((m) => sw(m, "came", "Ήρθε"))}</fieldset>
      {sec("Πώς παρουσιάστηκε", filled("presented"), <>{both((m) => <>{multi(m, "presented", PRESENTED)}{text(m, "presentedText", "Πώς παρουσιάστηκε", "με λόγια", 1)}</>)}</>)}
      {sec("Συνδέθηκε με το άλλο μέλος", filled("connected"), <>{both((m) => chips(m, "connected", CONNECTED))}</>)}
      {sec("Δέχτηκε βοήθεια", filled("acceptedHelp"), <>{both((m) => chips(m, "acceptedHelp", ACCEPTED_HELP))}</>)}
      {sec("Στάση", filled("stance"), <>{both((m) => chips(m, "stance", STANCE))}</>)}
      {sec("Τι εμφανίστηκε", filled("emergedText"), <>{both((m) => <>{themeForms.length > 0 && multi(m, "emerged", themeForms)}{text(m, "emergedText", "Τι εμφανίστηκε", "με δικά σου λόγια", 3)}</>)}</>)}
      {sec("Τι βγήκε από την κουβέντα", filled("outcome"), <>{both((m) => text(m, "outcome", "Τι βγήκε από την κουβέντα", "", 2))}</>)}
      {sec("Τα θετικά", filled("positives"), <>{both((m) => text(m, "positives", "Τα θετικά", "π.χ. στάθηκε δίπλα στο άλλο μέλος", 1))}</>)}
      {sec("Γράφει απογραφές;", filled("journaling"), <>{both((m) => journalChips(m))}</>)}
      {sec("Τι προτείναμε", filled("suggested"), <>{both((m) => text(m, "suggested", "Τι προτείναμε", "φαίνεται στον επόμενο θεραπευτή", 1))}</>)}
      <fieldset>
        <legend>Νηφαλιότητα και ασφάλεια</legend>
        {both((m) => (
          <>
            {sw(m, "sober", "Νηφάλιος/α από την προηγούμενη φορά")}
            {d[m.id].sober === false && (
              <label style={{ marginTop: 6 }}>Νέα ημερομηνία νηφαλιότητας
                <input type="date" value={d[m.id].newSoberSince ?? ""} onChange={(e) => set(m.id, "newSoberSince", e.target.value as never)} />
              </label>
            )}
            {sw(m, "safeOk", "Ασφάλεια: χωρίς ανησυχία")}
          </>
        ))}
      </fieldset>
      <fieldset>
        <legend>Προβληματισμός προς τη θεραπευτική ομάδα</legend>
        {both((m) => (
          <>
            {d[m.id].safeOk === false && <div className="small" style={{ color: "var(--red)" }}>υποχρεωτικό: τι ανησυχεί και ποιος ενημερώθηκε</div>}
            {text(m, "concern", "Προβληματισμός", "Αν γράψεις εδώ, ενημερώνεται η ομάδα", 2)}
            {sw(m, "notify", "Ενημέρωση ομάδας τώρα")}
          </>
        ))}
      </fieldset>
      <fieldset>
        {problem && <div className="error" role="alert" style={{ marginBottom: 10 }}>Δεν αποθηκεύτηκε ακόμα: {problem} Ό,τι έγραψες είναι εδώ.</div>}
        <button className="primary" type="submit" style={{ width: "100%", padding: 14 }}>Αποθήκευση (δύο σημειώματα)</button>
        <p className="muted small" style={{ margin: "8px 0 0" }}>Αποθηκεύεται με όνομα και ώρα· κάθε αλλαγή κρατά την προηγούμενη μορφή.</p>
      </fieldset>
    </form>
  );
}
