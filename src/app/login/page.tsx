import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, homeFor, login } from "@/lib/auth";
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
    <main style={{ maxWidth: 420, paddingTop: "8vh" }}>
      <div className="row" style={{ justifyContent: "center", marginBottom: 16 }}>
        <img src={s.logoUrl || "/icon.svg"} alt="" height={64} />
      </div>
      <h1 style={{ textAlign: "center" }}>{s.appName}</h1>
      {sp.e === "otp" && <div className="error">Για το προσωπικό χρειάζεται και ο 6ψήφιος κωδικός από την εφαρμογή επαλήθευσης.</div>}
      {sp.e && sp.e !== "otp" && <div className="error">Λάθος όνομα χρήστη ή κωδικός.</div>}
      <form action={doLogin} className="card">
        <div className="field">
          <label htmlFor="username">Όνομα χρήστη</label>
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div className="field">
          <label htmlFor="code">Προσωπικός κωδικός</label>
          <input id="code" name="code" type="password" autoComplete="current-password" required />
        </div>
        {sp.e === "otp" ? (
          <div className="field">
            <label htmlFor="otp">6ψήφιος κωδικός επαλήθευσης</label>
            <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus />
          </div>
        ) : (
          <details className="small" style={{ marginBottom: 12 }}>
            <summary>Προσωπικό: κωδικός επαλήθευσης</summary>
            <input name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="6 ψηφία" />
          </details>
        )}
        <button className="primary big" type="submit">Είσοδος</button>
        <p className="muted small" style={{ marginTop: 12 }}>
          Ξέχασες τον κωδικό; Επικοινώνησε με την ομάδα μας και θα σου δώσουμε νέο.
        </p>
      </form>
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <strong>Αν κινδυνεύεις τώρα, κάλεσε:</strong>
        <div className="stack" style={{ marginTop: 8 }}>
          {s.helplines.map((l) => (
            <a key={l.number} className={`btn${l.number === "112" ? " red" : ""}`} href={`tel:${l.number}`}>{l.number} · {l.label}</a>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>{s.crisisNotice}</p>
      </div>
    </main>
  );
}
