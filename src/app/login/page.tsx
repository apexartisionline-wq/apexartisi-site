import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, homeFor, login } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";
import { PasswordInput } from "@/components/PasswordInput";
import { DownloadButtons } from "@/components/InstallGuide";
import { getSettings } from "@/lib/settings";

// Σελίδα εισόδου (νέα κατεύθυνση 15/10, εικόνα της υπεύθυνης): φόρμα αριστερά, φωτογραφία δεξιά· στο κινητό μόνο η φόρμα.
// Ίδια φόρμα για τους τρεις ρόλους· μετά τη σύνδεση ο καθένας πάει στο δικό του «Σήμερα» (homeFor).
// «ΕΛ | EN» αλλάζει μόνο τα κείμενα αυτής της σελίδας — η εφαρμογή μέσα είναι στα ελληνικά.
const TEXT = {
  el: {
    hello: "Καλώς ήρθες",
    tagline: "Εδώ ξεκινά το Apex Protocol",
    user: "Όνομα χρήστη",
    userPh: "Το όνομα χρήστη σου",
    code: "Προσωπικός κωδικός",
    codePh: "Ο προσωπικός σου κωδικός",
    show: "Εμφάνιση κωδικού",
    hide: "Απόκρυψη κωδικού",
    submit: "Είσοδος",
    forgot: "Ξέχασες τον κωδικό σου;",
    forgotText: "Επικοινώνησε με την ομάδα μας και θα σου δώσουμε νέο.",
    otpSummary: "Για την ομάδα μας · κωδικός επαλήθευσης",
    otpLabel: "Εξαψήφιος κωδικός επαλήθευσης",
    otpPh: "6 ψηφία",
    otpNeeded: "Για την ομάδα μας χρειάζεται και ο εξαψήφιος κωδικός από την εφαρμογή επαλήθευσης.",
    wrong: "Δεν ταιριάζουν το όνομα και ο κωδικός. Δοκίμασε ξανά ή ζήτα νέο από την ομάδα μας.",
    lang: "Γλώσσα",
    install: "Το Apex στο κινητό σου",
  },
  en: {
    hello: "Welcome",
    tagline: "This is where Apex Protocol begins",
    user: "Username",
    userPh: "Your username",
    code: "Personal password",
    codePh: "Your personal password",
    show: "Show password",
    hide: "Hide password",
    submit: "Sign in",
    forgot: "Forgot your password?",
    forgotText: "Contact our team and we will give you a new one.",
    otpSummary: "For our team · verification code",
    otpLabel: "Six-digit verification code",
    otpPh: "6 digits",
    otpNeeded: "Our team also needs the six-digit code from the authenticator app.",
    wrong: "The username and password don't match. Try again or ask our team for a new one.",
    lang: "Language",
    install: "Apex on your phone (steps in Greek)",
  },
} as const;

async function doLogin(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const en = formData.get("lang") === "en" ? "&lang=en" : "";
  const user = await login(String(formData.get("username") ?? ""), String(formData.get("code") ?? ""), ip, String(formData.get("otp") ?? ""));
  if (user === "otp") redirect(`/login?e=otp${en}`);
  redirect(user ? homeFor(user.role) : `/login?e=1${en}`);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; lang?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  const en = sp.lang === "en";
  const t = en ? TEXT.en : TEXT.el;
  return (
    <div className="login-split" lang={en ? "en" : "el"}>
      <nav className="login-lang" aria-label={t.lang}>
        <Link href="/login" hrefLang="el" aria-current={en ? undefined : "true"}>ΕΛ</Link>
        <span aria-hidden="true">|</span>
        <Link href="/login?lang=en" hrefLang="en" aria-current={en ? "true" : undefined}>EN</Link>
      </nav>
      <main className="login">
        <div className="login-inner">
          {/* Σήμα + «Apex» (απόφαση 4/10: τη σελίδα τη βλέπουν και τα μέλη, μόνο το ουδέτερο όνομα)· το σήμα από το BrandMark,
              με το λεπτό τόξο (απόφαση 10/10), «Apex» στο accent, επίπεδο (απόφαση 5/10). */}
          <div className="login-brand" role="img" aria-label={s.appName}>
            {s.logoUrl ? <img src={s.logoUrl} alt="" /> : <BrandMark className="login-mark" echo />}
            <span className="apex-word" aria-hidden="true">{s.appName}</span>
          </div>
          <h1 className="login-hello">{t.hello}</h1>
          <p className="login-tagline">{t.tagline}</p>
          <form action={doLogin} className="login-form">
            {en && <input type="hidden" name="lang" value="en" />}
            {sp.e === "otp" && <div className="login-error" role="alert">{t.otpNeeded}</div>}
            {sp.e && sp.e !== "otp" && <div className="login-error" role="alert">{t.wrong}</div>}
            <div className="field">
              <label htmlFor="username">{t.user}</label>
              <input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t.userPh} required />
            </div>
            <div className="field">
              <label htmlFor="code">{t.code}</label>
              <PasswordInput id="code" name="code" placeholder={t.codePh} showLabel={t.show} hideLabel={t.hide} />
            </div>
            {sp.e === "otp" && (
              <div className="field">
                <label htmlFor="otp">{t.otpLabel}</label>
                <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus />
              </div>
            )}
            <button className="primary big login-submit" type="submit">
              {t.submit}
              <Icon name="arrow" size={22} />
            </button>
            <div className="login-more">
              <details className="login-forgot">
                <summary>{t.forgot}</summary>
                <p>{t.forgotText}</p>
              </details>
              {sp.e !== "otp" && (
                <details className="login-otp">
                  <summary>{t.otpSummary}</summary>
                  <input name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder={t.otpPh} aria-label={t.otpLabel} />
                </details>
              )}
            </div>
          </form>
          <div className="login-install">
            <span>{t.install}</span>
            <DownloadButtons />
          </div>
        </div>
      </main>
      {/* Φωτογραφία ως φόντο CSS: στο κινητό είναι κρυφή και δεν κατεβαίνει καθόλου. Διακοσμητική — δεν διαβάζεται. */}
      <div className="login-photo" aria-hidden="true" />
    </div>
  );
}
