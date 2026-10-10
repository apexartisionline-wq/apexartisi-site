import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, homeFor, login } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { getSettings } from "@/lib/settings";

async function doLogin(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const user = await login(String(formData.get("username") ?? ""), String(formData.get("code") ?? ""), ip, String(formData.get("otp") ?? ""));
  if (user === "otp") redirect("/login?e=otp");
  redirect(user ? homeFor(user.role) : "/login?e=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  return (
    <main className="login">
      {/* Σήμα ισορροπημένο: δαχτυλίδι όσο το ύψος της λέξης, χωρίς πλακίδιο (απόφαση 10/10, τρεις ειδικοί).
          Μένει το ουδέτερο «Apex» γιατί τη σελίδα τη βλέπουν και τα μέλη (απόφαση 4/10). */}
      <h1 className="login-brand" aria-label={s.appName}>
        {s.logoUrl ? <img src={s.logoUrl} alt="" /> : <BrandMark className="login-mark" echo />}
        <span className="apex-word">{s.appName}</span>
      </h1>
      {/* Γραμμές ταυτότητας κάτω από το σήμα (απόφαση 10/10). */}
      <p className="login-tagline">Εδώ ξεκινά το Apex Protocol</p>
      <p className="login-global">Apex Protocol Global</p>
      <p className="login-hello muted">Καλώς ήρθες.</p>
      <form action={doLogin} className="card login-card">
        {sp.e === "otp" && <div className="login-error" role="alert">Για την ομάδα μας χρειάζεται και ο εξαψήφιος κωδικός από την εφαρμογή επαλήθευσης.</div>}
        {sp.e && sp.e !== "otp" && <div className="login-error" role="alert">Δεν ταιριάζουν το όνομα και ο κωδικός. Δοκίμασε ξανά ή ζήτα νέο από την ομάδα μας.</div>}
        <div className="field">
          <label htmlFor="username">Όνομα χρήστη</label>
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div className="field">
          <label htmlFor="code">Προσωπικός κωδικός</label>
          <input id="code" name="code" type="password" autoComplete="current-password" enterKeyHint="go" required />
        </div>
        {sp.e === "otp" ? (
          <div className="field">
            <label htmlFor="otp">Εξαψήφιος κωδικός επαλήθευσης</label>
            <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus />
          </div>
        ) : null}
        <button className="primary big" type="submit">Είσοδος</button>
        {sp.e !== "otp" && (
          <details className="login-otp">
            <summary>Για την ομάδα μας · κωδικός επαλήθευσης</summary>
            <input name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="6 ψηφία" aria-label="Κωδικός επαλήθευσης" />
          </details>
        )}
        <p className="login-forgot"><strong>Ξέχασες τον κωδικό;</strong> <span className="muted">Επικοινώνησε με την ομάδα μας και θα σου δώσουμε νέο.</span></p>
      </form>
      {/* Χωρίς κουτί γραμμών βοήθειας εδώ (απόφαση 10/10): η είσοδος μένει καθαρή· οι γραμμές είναι μέσα στην εφαρμογή (κόκκινο κουμπί). */}
    </main>
  );
}
