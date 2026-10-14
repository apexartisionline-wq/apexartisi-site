import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHead, Panel, Pill } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/guide";
import { isPublished } from "@/lib/member";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, localParts, mondayOf } from "@/lib/time";
import styles from "./page.module.css";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", IMAGE: "Εικόνα", LINK: "Βίντεο" } as const;
const PAST_WEEKS = 4;

type Item = { id: string; date: string; kind: "DAILY_TEXT" | "FORM"; title: string; body: string; url: string | null };

/** Σύντομη περιγραφή από την αρχή του κειμένου (μία γραμμή). */
function excerpt(body: string, max = 140): string {
  const t = body.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s\S*$/, "")}…` : t;
}

// Ό,τι έχει σταλεί στα μέλη, όπως το βλέπουν εκείνα: κείμενα της ημέρας, φόρμες της θεματικής, βιβλιοθήκη.
// Πρώτα η τρέχουσα εβδομάδα· μετά οι προηγούμενες· χωριστά ό,τι δεν έχει βγει ακόμα στα μέλη· στο τέλος η βιβλιοθήκη.
// Ο θεραπευτής μόνο βλέπει: αποστολή και αλλαγές γίνονται από τη διαχείριση.
export default async function TherapistMaterial({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("THERAPIST", "ADMIN");
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 80);
  const needle = normalizeSearch(q);
  const matches = (...xs: string[]) => !needle || normalizeSearch(xs.join(" ")).includes(needle);

  const now = new Date();
  const today = localParts(now).date;
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const pastFrom = addDays(monday, -7 * PAST_WEEKS);
  const [s, all, shared] = await Promise.all([
    getSettings(),
    prisma.content.findMany({
      where: { date: { gte: pastFrom } },
      orderBy: [{ date: "asc" }],
      select: { id: true, date: true, kind: true, title: true, body: true, url: true, imageMime: true },
    }),
    prisma.libraryItem.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, description: true } }),
  ]);
  const timeOf = (c: Item) => (c.kind === "DAILY_TEXT" ? s.dailyTextTime : s.formsTime);
  const out = (c: Item) => isPublished(c.date, timeOf(c), now);
  // «Με τη σειρά που χρησιμοποιούνται»: ημέρα, μετά η ώρα που βγαίνει στα μέλη.
  const byUse = (a: Item, b: Item) => a.date.localeCompare(b.date) || timeOf(a).localeCompare(timeOf(b)) || a.title.localeCompare(b.title);
  const items = (all as Item[]).slice().sort(byUse);

  // Θεματική: όλες οι φόρμες της εβδομάδας (Δευτέρα–Κυριακή), αριθμημένες όπως στη σελίδα της ατομικής.
  // Κάθε φόρμα παίρνει τον αριθμό της μέσα στην εβδομάδα της (και για προηγούμενες ή επόμενες εβδομάδες).
  const formNo = new Map<string, number>();
  const perWeek = new Map<string, number>();
  for (const c of items) {
    if (c.kind !== "FORM") continue;
    const n = (perWeek.get(mondayOf(c.date)) ?? 0) + 1;
    perWeek.set(mondayOf(c.date), n);
    formNo.set(c.id, n);
  }
  const label = (c: Item) => (formNo.has(c.id) ? `Φόρμα ${formNo.get(c.id)}` : undefined);
  const weekForms = items.filter((c) => c.kind === "FORM" && c.date >= monday && c.date <= sunday);
  const todayText = items.find((c) => c.kind === "DAILY_TEXT" && c.date === today);
  // Τρέχουσα εβδομάδα: μόνο ό,τι έχει ήδη βγει. Ό,τι δεν έχει βγει, στο «Ετοιμασμένο».
  const thisWeek = items.filter((c) => c.date >= monday && c.date <= sunday && out(c) && matches(c.title));
  const upcoming = items.filter((c) => !out(c) && matches(c.title));
  const pastWeeks = Array.from({ length: PAST_WEEKS }, (_, i) => {
    const from = addDays(monday, -7 * (i + 1));
    const week = items.filter((c) => c.date >= from && c.date <= addDays(from, 6));
    return { from, forms: week.filter((c) => c.kind === "FORM"), items: week.filter((c) => matches(c.title)) };
  });
  const pastCount = pastWeeks.reduce((n, w) => n + w.items.length, 0);
  const library = shared.filter((i) => matches(i.title));
  const total = thisWeek.length + upcoming.length + pastCount + library.length;

  const range = (from: string) => `${formatDate(from)} – ${formatDate(addDays(from, 6))}`;
  const kindLabel = (c: Item) => (c.kind === "DAILY_TEXT" ? "Κείμενο της ημέρας" : "Φόρμα της θεματικής");

  // Όνομα θεματικής από τους τίτλους των φορμών («Πίστη: τι εμπιστεύομαι» → «Πίστη»)· όσα έχουν ήδη το όνομα δεν το επαναλαμβάνουν.
  const themeOf = (forms: Item[]): string | null => {
    const heads = forms.map((f) => (f.title.includes(":") ? f.title.split(":")[0].trim() : "")).filter(Boolean);
    if (heads.length === 0) return null;
    const count = new Map<string, number>();
    for (const h of heads) count.set(h, (count.get(h) ?? 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1])[0][0];
  };
  const bare = (c: Item, theme: string | null) => (theme && c.title.startsWith(`${theme}:`) ? c.title.slice(theme.length + 1).trim() : c.title);
  const weekTheme = themeOf(weekForms);

  const Row = ({ c, theme = null, withKind = false }: { c: Item; theme?: string | null; withKind?: boolean }) => {
    const published = out(c);
    const no = label(c);
    const desc = excerpt(c.body);
    return (
      <div className={`linkrow ${styles.item}`}>
        <span className={`iconbox ${styles.icon}`}><Icon name={c.kind === "FORM" ? "list" : "doc"} /></span>
        <span className="grow">
          <strong>{no ? `${no} · ` : ""}{bare(c, theme)}</strong>
          <div className="hint">
            {formatDate(c.date)}{withKind && ` · ${kindLabel(c)}`}
            {published ? "" : ` · βγαίνει στις ${timeOf(c)}`}
          </div>
          {desc && <div className={styles.desc}>{desc}</div>}
        </span>
        {!published && <span className="pill grey">δεν έχει βγει ακόμα</span>}
        <Link className="btn outline sm" href={`/t/material/c/${c.id}`} aria-label={`Άνοιγμα: ${c.title}`}>Άνοιγμα</Link>
      </div>
    );
  };

  const empty = (text: string) => <p className="empty">{needle ? `Τίποτα με «${q}» εδώ.` : text}</p>;
  // Κείμενα της ημέρας της εβδομάδας που έχουν ήδη βγει (εκτός από το σημερινό, που φαίνεται πάνω).
  const weekTexts = thisWeek.filter((c) => c.kind === "DAILY_TEXT" && c.id !== todayText?.id);

  return (
    <main className="wide">
      <PageHead
        crumbs={[{ href: "/t", label: "Σήμερα" }, { label: "Υλικό" }]}
        title="Υλικό"
        sub="Ό,τι στέλνει η διαχείριση στα μέλη, για να ξέρεις τι δουλεύουν. Το βλέπεις όπως το βλέπουν εκείνα· η αποστολή γίνεται από τη διαχείριση."
      >
        <form className={`${styles.search}`} role="search" method="get" action="/t/material">
          <label htmlFor="material-q" className={styles.srOnly}>Αναζήτηση στους τίτλους</label>
          <input id="material-q" type="search" name="q" defaultValue={q} placeholder="Αναζήτηση τίτλου" autoComplete="off" />
          <button type="submit" className="btn outline"><Icon name="search" size={18} /> Αναζήτηση</button>
        </form>
      </PageHead>

      {needle && (
        <p className={styles.filterNote}>
          {total === 0 ? <>Δεν βρέθηκε υλικό με «{q}».</> : <>{total} {total === 1 ? "αποτέλεσμα" : "αποτελέσματα"} για «{q}».</>}{" "}
          <Link href="/t/material">Καθαρισμός αναζήτησης</Link>
        </p>
      )}

      <div className="cols cols-60">
        <div className="stackv">
          {!needle && (
            <section className={`panel ${styles.theme}`}>
              <div className="panel-head">
                <div>
                  <div className="hint">Θέμα τρέχουσας εβδομάδας · {range(monday)}</div>
                  <h2 className={styles.themeName}>{weekTheme ?? (weekForms.length > 0 ? "Φόρμες της εβδομάδας" : "Δεν έχει οριστεί θεματική")}</h2>
                </div>
                {weekForms.length > 0 && <Pill>{weekForms.length} {weekForms.length === 1 ? "φόρμα" : "φόρμες"}</Pill>}
              </div>
              {weekForms.length === 0 ? (
                <p className="empty">Δεν έχει ανέβει ακόμα φόρμα της θεματικής για αυτή την εβδομάδα. Όταν την ανεβάσει η διαχείριση, θα φανεί εδώ ως «Φόρμα 1».</p>
              ) : (
                <>
                  <p className="hint" style={{ margin: "0 0 6px" }}>Οι φόρμες με τη σειρά που χρησιμοποιούνται· κάθε μέλος τις συμπληρώνει από τα «Κείμενα».</p>
                  {weekForms.map((c) => <Row key={c.id} c={c} theme={weekTheme} />)}
                </>
              )}
              <h3 className={styles.sub}>Κείμενο της ημέρας · {formatDate(today)}</h3>
              {todayText ? <Row c={todayText} /> : <p className="empty">Δεν υπάρχει κείμενο της ημέρας για σήμερα.</p>}
              {weekTexts.length > 0 && (
                <details className="fold" style={{ marginTop: 10 }}>
                  <summary>Κείμενα της ημέρας που βγήκαν αυτή την εβδομάδα ({weekTexts.length})</summary>
                  {weekTexts.map((c) => <Row key={c.id} c={c} />)}
                </details>
              )}
            </section>
          )}

          {needle && thisWeek.length > 0 && (
            <Panel title="Αυτή την εβδομάδα">
              {thisWeek.map((c) => <Row key={c.id} c={c} withKind />)}
            </Panel>
          )}

          <Panel title="Προηγούμενες εβδομάδες" id="past">
            <p className="hint" style={{ margin: "-6px 0 8px" }}>τελευταίες {PAST_WEEKS} εβδομάδες</p>
            {pastCount === 0 ? empty("Δεν υπάρχει υλικό από τις προηγούμενες εβδομάδες.") : pastWeeks.filter((w) => w.items.length > 0).map((w) => {
              const th = themeOf(w.forms);
              return (
                <details key={w.from} className={`fold ${styles.week}`} open={Boolean(needle)}>
                  <summary>
                    <span className="grow">Εβδομάδα {range(w.from)}{th && <span className="muted"> · {th}</span>}</span>
                    <Pill tone="grey">{w.items.length} {w.items.length === 1 ? "στοιχείο" : "στοιχεία"}</Pill>
                  </summary>
                  {w.items.map((c) => <Row key={c.id} c={c} theme={th} withKind />)}
                </details>
              );
            })}
          </Panel>
        </div>

        <div className="stackv">
          <section className={`panel ${styles.upcoming}`}>
            <div className="panel-head">
              <h2>Ετοιμασμένο για τις επόμενες μέρες</h2>
              <Pill tone="grey">δεν έχει βγει ακόμα στα μέλη</Pill>
            </div>
            <p className="hint" style={{ margin: "0 0 6px" }}>Για να ετοιμαστείς. Τα μέλη δεν το βλέπουν ακόμα — βγαίνει μόνο του τη μέρα και την ώρα που γράφει.</p>
            {upcoming.length === 0
              ? empty("Δεν υπάρχει υλικό έτοιμο για τις επόμενες μέρες.")
              : upcoming.map((c) => <Row key={c.id} c={c} withKind />)}
          </section>

          <Panel title="Βιβλιοθήκη">
            <p className="hint" style={{ margin: "-6px 0 8px" }}>κοινό υλικό για όλα τα μέλη</p>
            {library.length === 0 ? empty("Η βιβλιοθήκη δεν έχει υλικό ακόμα.") : library.map((i) => (
              <div key={i.id} className={`linkrow ${styles.item}`}>
                <span className={`iconbox ${styles.icon}`}><Icon name={i.kind === "PDF" ? "doc" : "video"} /></span>
                <span className="grow">
                  <strong>{i.title}</strong>
                  <div className="hint">{KIND[i.kind]}</div>
                  {i.description && <div className={styles.desc}>{excerpt(i.description)}</div>}
                </span>
                <Link className="btn outline sm" href={`/t/material/l/${i.id}`} aria-label={`Άνοιγμα: ${i.title}`}>Άνοιγμα</Link>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </main>
  );
}
