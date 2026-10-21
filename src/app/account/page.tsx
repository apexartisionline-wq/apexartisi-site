import Link from "next/link";
import bcrypt from "bcryptjs";
import { RedirectType, redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { hashPassword, logoutEverywhere, requireRole, homeFor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";
import { getSettings } from "@/lib/settings";
import { ndaStatus, NDA_STATE } from "@/lib/nda";
import { PushToggle } from "@/components/PushToggle";
import { ErrorNote, PageHead } from "@/components/ui";
import { vapidPublicKey } from "@/lib/push";
import { cookies } from "next/headers";
import { THEME_COOKIE, THEMES, themeOf } from "@/lib/theme";
import { MEMBER_PREFS, type Prefs } from "@/lib/schedule";
import { newSecret, qrFor, verifyTotp } from "@/lib/totp";
import { memberConsents, memberNavOpts } from "@/lib/intake";
import { CHOICE_LABEL, PURPOSES } from "@/lib/intake-rules";

const ROLE = { MEMBER: "Μέλος", THERAPIST: "Θεραπευτής", ADMIN: "Διαχείριση" } as const;

// Κάθε χρήστης αλλάζει μόνος του τον προσωπικό του κωδικό.
async function changeCode(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");
  const first = user.mustChangeCode;
  const q = first ? "&first=1" : "";
  if (!(await bcrypt.compare(current, user.passwordHash))) redirect(`/account?e=current${q}`);
  if (next.length < 8) redirect(`/account?e=short${q}`);
  if (next !== again) redirect(`/account?e=match${q}`);
  if (next === current) redirect(`/account?e=same${q}`);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangeCode: false } });
  // Πρώτη είσοδος με κωδικό από email (16/10): μετά την αλλαγή, κατευθείαν στο «Σήμερα».
  redirect(first ? homeFor(user.role) : "/account?ok=1");
}

// Χρωματικό θέμα (17/10): κάθε ρόλος διαλέγει μόνος του· προεπιλογή πάντα το φωτεινό.
async function setTheme(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const theme = themeOf(formData.get("theme"));
  await prisma.user.update({ where: { id: user.id }, data: { theme } });
  (await cookies()).set(THEME_COOKIE, theme, { sameSite: "lax", path: "/", expires: new Date(Date.now() + 365 * 86_400_000) });
  redirect("/account?okt=1", RedirectType.replace);
}

async function signOutAll() {
  "use server";
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  await logoutEverywhere(user.id);
  redirect("/login");
}

async function savePrefs(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const prefs: Prefs = {};
  for (const p of MEMBER_PREFS) prefs[p.key] = formData.get(p.key) === "on";
  await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: prefs } });
  redirect("/account?okp=1", RedirectType.replace);
}

// Ανάκληση προαιρετικής συγκατάθεσης από το ίδιο το μέλος (01β, Μέρος Δ).
async function withdraw(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER");
  const purpose = PURPOSES.find((p) => p.key === String(formData.get("purpose")));
  if (!purpose || purpose.required || !purpose.choices.includes("NO")) redirect("/account");
  const s = await getSettings();
  await prisma.consent.create({ data: { memberId: user.id, purpose: purpose.key, choice: "NO", version: s.consentVersion, recordedById: user.id } });
  if (purpose.key === "self_message") await prisma.user.update({ where: { id: user.id }, data: { selfMessage: null, selfMessageType: null } });
  redirect("/account?okc=1", RedirectType.replace);
}

async function start2fa() {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  if (user.totpEnabled) redirect("/account");
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: newSecret().stored } });
  redirect("/account?setup2fa=1");
}

async function confirm2fa(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  if (!verifyTotp(user.totpSecret, String(formData.get("otp") ?? ""))) redirect("/account?setup2fa=1&e=otp");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  redirect("/account?ok2fa=1");
}

const ERRORS: Record<string, string> = {
  current: "Ο τωρινός κωδικός δεν είναι σωστός.",
  short: "Ο νέος κωδικός θέλει τουλάχιστον 8 χαρακτήρες.",
  match: "Οι δύο νέοι κωδικοί δεν είναι ίδιοι.",
  otp: "Ο 6ψήφιος κωδικός δεν ταιριάζει. Δοκίμασε ξανά.",
  same: "Ο νέος κωδικός πρέπει να είναι διαφορετικός από αυτόν που σου στείλαμε.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string; setup2fa?: string; ok2fa?: string; okp?: string; okc?: string; first?: string; okt?: string; w?: string }> }) {
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const sp = await searchParams;
  const staff = user.role !== "MEMBER";
  const s = await getSettings();
  const consents = staff ? {} : await memberConsents(user.id);
  const qr = staff && !user.totpEnabled && user.totpSecret ? await qrFor(user.totpSecret, user.username, s.appName) : null;
  // Ίδιο μενού με τις σελίδες του μέλους (layout /m): «Το πλάνο μου», «Από την ομάδα», και μειωμένο όσο εκκρεμεί η έναρξη.
  const navOpts = staff ? { hasPlan: false, hasMessages: false, intakePending: false } : await memberNavOpts(user);
  // Ανάκληση συγκατάθεσης με επιβεβαίωση (20/10): ?w=<σκοπός>.
  const withdrawing = !staff && sp.w ? PURPOSES.find((p) => p.key === sp.w && !p.required && consents[p.key] === "YES" && p.choices.includes("NO")) : undefined;
  return (
    <>
      <Nav menu={staff} compact={!staff} links={navLinks(user.role, navOpts)} />
      {/* Ίδιο περιβάλλον με την υπόλοιπη εφαρμογή του ρόλου (20/10): φόντο --canvas και λευκές κάρτες, όπως στο «Σήμερα». */}
      <div className={staff ? "staff" : "member-env"}>
      <main>
        <BackButton home={!staff && navOpts.intakePending ? "/m/start" : homeFor(user.role)} />
        <PageHead title="Ο λογαριασμός μου" sub={<>{user.name} · @{user.username} · {ROLE[user.role]}</>} />
        {user.mustChangeCode && (
          <div className="notice" id="first-code">
            <strong>Καλώς ήρθες.</strong> Ο κωδικός που σου στείλαμε είναι προσωρινός. Βάλε δικό σου κωδικό (τουλάχιστον 8 χαρακτήρες) στην «Αλλαγή κωδικού» παρακάτω, και μετά σε πάμε στο «Σήμερα».
          </div>
        )}
        <h2>Εμφάνιση</h2>
        <form action={setTheme} className="card">
          {sp.okt && <div className="notice">Αποθηκεύτηκε ✓</div>}
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
              <label key={k} className="row" style={{ gap: 6 }}>
                <input type="radio" name="theme" value={k} defaultChecked={themeOf(user.theme) === k} style={{ width: "auto" }} /> {THEMES[k]}
              </label>
            ))}
            <button type="submit" className="sm">Αποθήκευση</button>
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Το φωτεινό είναι η προεπιλογή σε κάθε συσκευή. Η επιλογή σου μένει στον λογαριασμό σου.</p>
        </form>
        <h2>Ειδοποιήσεις</h2>
        <div className="card stack">
          <PushToggle vapidKey={vapidPublicKey()} />
          {!staff && (
            <form action={savePrefs} className="stack">
              {sp.okp && <div className="notice">Αποθηκεύτηκε ✓</div>}
              {MEMBER_PREFS.map((p) => (
                <label key={p.key} className="row" style={{ gap: 8 }}>
                  <input type="checkbox" name={p.key} defaultChecked={(user.notifyPrefs as Prefs)?.[p.key] !== false} style={{ width: "auto" }} /> {p.label}
                </label>
              ))}
              <p className="muted small">Οι ειδοποιήσεις δεν λένε τίποτα προσωπικό. Τίποτα από τις 22:00 ως τις 08:00.</p>
              <button type="submit">Αποθήκευση</button>
            </form>
          )}
          {staff && <p className="muted small">Το κόκκινο κουμπί έρχεται ως ειδοποίηση σε όλο το προσωπικό. Όποιος εφημερεύει, να επιτρέψει στο κινητό να περνά από το αθόρυβο.</p>}
        </div>

        {staff && <NdaAccountLine user={user} />}
        {staff && (
          <>
            <h2>Δεύτερος κωδικός (επαλήθευση σε δύο βήματα)</h2>
            {sp.ok2fa && <div className="notice">Ενεργοποιήθηκε ✓</div>}
            {user.totpEnabled ? (
              <div className="card">Ενεργός ✓ Στην είσοδο θα ζητείται και ο 6ψήφιος κωδικός από την εφαρμογή σου.</div>
            ) : (
              <div className="card stack">
                {sp.setup2fa && !qr && <div className="error">Για το προσωπικό απαιτείται δεύτερος κωδικός πριν ανοίξουν οι φάκελοι.</div>}
                <p className="small">
                  Βλέπεις δεδομένα υγείας, γι' αυτό χρειάζεται και δεύτερος κωδικός από εφαρμογή επαλήθευσης στο κινητό
                  (π.χ. Google Authenticator, Microsoft Authenticator, 1Password).
                  {s.requireStaff2FA
                    ? " Είναι υποχρεωτικός: χωρίς αυτόν δεν ανοίγουν οι φάκελοι."
                    : " Σε αυτή την εγκατάσταση η διαχείριση τον έχει προς το παρόν προαιρετικό (ρύθμιση «Υποχρεωτικός δεύτερος κωδικός»)· σε πραγματική λειτουργία θα είναι υποχρεωτικός πριν ανοίξουν οι φάκελοι."}
                </p>
                {!qr ? (
                  <form action={start2fa}><button className="primary" type="submit">Ξεκίνα τη ρύθμιση</button></form>
                ) : (
                  <form action={confirm2fa} className="stack">
                    <p className="small">1. Σκάναρε τον κωδικό με την εφαρμογή (ή γράψε: <code>{qr.plain}</code>).</p>
                    <img src={qr.dataUrl} alt="Κωδικός QR για την εφαρμογή επαλήθευσης" width={220} height={220} />
                    <label htmlFor="otp">2. Γράψε τον 6ψήφιο κωδικό που δείχνει η εφαρμογή</label>
                    <input id="otp" name="otp" inputMode="numeric" pattern="\d{6}" required autoComplete="one-time-code" />
                    <button className="primary" type="submit">Ενεργοποίηση</button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
        <h2>Αλλαγή κωδικού</h2>
        {sp.ok && <div className="notice">Ο κωδικός άλλαξε ✓</div>}
        {sp.e && ERRORS[sp.e] && <ErrorNote>{ERRORS[sp.e]}</ErrorNote>}
        <form action={changeCode} className="card">
          <div className="field"><label htmlFor="current">Τωρινός κωδικός</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="next">Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required /></div>
          <div className="field"><label htmlFor="again">Ξανά ο νέος κωδικός</label><input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required /></div>
          <button className="primary" type="submit">Αλλαγή</button>
        </form>
        {!staff && Object.keys(consents).length > 0 && (
          <>
            <h2>Οι συγκαταθέσεις μου</h2>
            <div className="card stack">
              {sp.okc && <div className="notice">Η συγκατάθεση ανακλήθηκε ✓</div>}
              {PURPOSES.filter((p) => consents[p.key]).map((p) => (
                <div key={p.key} className="m-row">
                  <span className="grow">{p.label}: <strong>{CHOICE_LABEL[consents[p.key]]}</strong></span>
                  {!p.required && consents[p.key] === "YES" && p.choices.includes("NO") && (
                    <Link className="btn outline sm" href={`/account?w=${p.key}#consents`}>Ανάκληση</Link>
                  )}
                </div>
              ))}
              {withdrawing && (
                <div className="notice" id="consents" style={{ marginBottom: 0 }}>
                  <p style={{ margin: "0 0 8px" }}><strong>Να ανακληθεί η συγκατάθεση «{withdrawing.label}»;</strong> Ισχύει από τώρα και μετά· για να την ξαναδώσεις, μίλα με την ομάδα.</p>
                  <div className="row">
                    <form action={withdraw}>
                      <input type="hidden" name="purpose" value={withdrawing.key} />
                      <button type="submit" className="red">Ναι, ανάκληση</button>
                    </form>
                    <Link className="btn" href="/account">Όχι, πίσω</Link>
                  </div>
                </div>
              )}
              <p className="muted small">
                Για να πεις «ναι» σε κάτι που είχες πει «όχι», ή για τα απαραίτητα, μίλα με την ομάδα σου. Η ανάκληση ισχύει από τώρα και μετά.
              </p>
            </div>
          </>
        )}
        {!staff && (
          <>
            <h2>Τα στοιχεία μου</h2>
            <Link className="linkrow panel" href="/m/profile">
              <span className="grow"><div style={{ fontWeight: 600 }}>Διεύθυνση και επαφή έκτακτης ανάγκης</div><div className="hint">Τα βλέπει μόνο η διαχείριση. Μπορείς να τα αλλάξεις όποτε θέλεις.</div></span>
              <span className="arrow">›</span>
            </Link>
          </>
        )}
        <h2>Συσκευές</h2>
        <form action={signOutAll} className="card m-row">
          <span className="grow">Αν έχασες το κινητό σου ή το έδωσες σε άλλον, βγες από όλες τις συσκευές.</span>
          <button type="submit">Έξοδος από όλες τις συσκευές</button>
        </form>
      </main>
      </div>
      {!staff && (
        <div className="redbar">
          <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
        </div>
      )}
    </>
  );
}

// Έντυπο εχεμύθειας (14/10): το προσωπικό βλέπει την κατάστασή του και ανοίγει τη σελίδα του εντύπου.
async function NdaAccountLine({ user }: { user: { id: string; role: string; ndaExempt: boolean } }) {
  const st = await ndaStatus(user);
  if (!st.doc || st.exempt) return null;
  const state = !st.consent ? "none" : st.signed ? "signed" : "accepted";
  return (
    <>
      <h2>Έντυπο εχεμύθειας</h2>
      <div className="card row spread" style={{ flexWrap: "wrap", gap: 8 }}>
        <span>Έκδοση {st.doc.version}: <strong>{NDA_STATE[state].text}</strong></span>
        <Link className="btn outline sm" href="/nda">{state === "signed" ? "Δες το έντυπο" : "Άνοιγμα ›"}</Link>
      </div>
    </>
  );
}
