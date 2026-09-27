import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { hashPassword, logoutEverywhere, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";
import { getSettings } from "@/lib/settings";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push";
import { MEMBER_PREFS, type Prefs } from "@/lib/schedule";
import { newSecret, qrFor, verifyTotp } from "@/lib/totp";
import { memberConsents } from "@/lib/intake";
import { CHOICE_LABEL, PURPOSES } from "@/lib/intake-rules";

const ROLE = { MEMBER: "Μέλος", THERAPIST: "Θεραπευτής", ADMIN: "Διαχείριση" } as const;

// Κάθε χρήστης αλλάζει μόνος του τον προσωπικό του κωδικό.
async function changeCode(formData: FormData) {
  "use server";
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");
  if (!(await bcrypt.compare(current, user.passwordHash))) redirect("/account?e=current");
  if (next.length < 8) redirect("/account?e=short");
  if (next !== again) redirect("/account?e=match");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  redirect("/account?ok=1");
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
  redirect("/account?okp=1");
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
  redirect("/account?okc=1");
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
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string; setup2fa?: string; ok2fa?: string; okp?: string; okc?: string }> }) {
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const sp = await searchParams;
  const staff = user.role !== "MEMBER";
  const s = await getSettings();
  const consents = staff ? {} : await memberConsents(user.id);
  const qr = staff && !user.totpEnabled && user.totpSecret ? await qrFor(user.totpSecret, user.username, s.appName) : null;
  return (
    <>
      <Nav links={navLinks(user.role)} />
      <main>
        <h1>Ο λογαριασμός μου</h1>
        <div className="card">
          <div>{user.name}</div>
          <div className="muted small">@{user.username} · {ROLE[user.role]}</div>
        </div>
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
              <p className="muted small">Οι ειδοποιήσεις δεν λένε ποτέ τι αφορούν. Τίποτα μετά τις 22:00.</p>
              <button type="submit">Αποθήκευση</button>
            </form>
          )}
          {staff && <p className="muted small">Το κόκκινο κουμπί έρχεται ως ειδοποίηση σε όλο το προσωπικό. Όποιος εφημερεύει, να επιτρέψει στο κινητό να περνά από το αθόρυβο.</p>}
        </div>

        {staff && (
          <>
            <h2>Δεύτερος κωδικός (επαλήθευση σε δύο βήματα)</h2>
            {sp.ok2fa && <div className="notice">Ενεργοποιήθηκε ✓</div>}
            {user.totpEnabled ? (
              <div className="card">Ενεργός ✓ Στη σύνδεση θα ζητείται και ο 6ψήφιος κωδικός από την εφαρμογή σου.</div>
            ) : (
              <div className="card stack">
                {sp.setup2fa && !qr && <div className="error">Για το προσωπικό απαιτείται δεύτερος κωδικός πριν ανοίξουν οι φάκελοι.</div>}
                <p className="small">
                  Βλέπεις δεδομένα υγείας, γι' αυτό χρειάζεται και δεύτερος κωδικός από εφαρμογή επαλήθευσης στο κινητό
                  (π.χ. Google Authenticator, Microsoft Authenticator, 1Password).
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
        {sp.e && ERRORS[sp.e] && <div className="error">{ERRORS[sp.e]}</div>}
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
                <div key={p.key} className="row spread">
                  <span>{p.label}: <strong>{CHOICE_LABEL[consents[p.key]]}</strong></span>
                  {!p.required && consents[p.key] === "YES" && p.choices.includes("NO") && (
                    <form action={withdraw}>
                      <input type="hidden" name="purpose" value={p.key} />
                      <button type="submit" style={{ padding: "4px 8px" }}>Ανάκληση</button>
                    </form>
                  )}
                </div>
              ))}
              <p className="muted small">
                Για να πεις «ναι» σε κάτι που είχες πει «όχι», ή για τα απαραίτητα, μίλα με την ομάδα. Η ανάκληση ισχύει από τώρα και μετά.
              </p>
            </div>
          </>
        )}
        <h2>Συσκευές</h2>
        <form action={signOutAll} className="card row spread">
          <span>Αν χάθηκε ή δόθηκε το κινητό σου, αποσυνδέσου από όλες τις συσκευές.</span>
          <button type="submit">Αποσύνδεση παντού</button>
        </form>
      </main>
    </>
  );
}
