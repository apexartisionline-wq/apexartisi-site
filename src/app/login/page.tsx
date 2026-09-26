import { redirect } from "next/navigation";
import { currentUser, homeFor, login } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

async function doLogin(formData: FormData) {
  "use server";
  const user = await login(String(formData.get("username") ?? ""), String(formData.get("code") ?? ""));
  redirect(user ? homeFor(user.role) : "/login?e=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  return (
    <main style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <div className="row" style={{ justifyContent: "center", marginBottom: 16 }}>
        <img src={s.logoUrl || "/icon.svg"} alt="" height={64} />
      </div>
      <h1 style={{ textAlign: "center" }}>{s.appName}</h1>
      {sp.e && <div className="error">Λάθος όνομα χρήστη ή κωδικός. Μετά από 5 λάθη ο λογαριασμός κλειδώνει για 15 λεπτά.</div>}
      <form action={doLogin} className="card">
        <div className="field">
          <label htmlFor="username">Όνομα χρήστη</label>
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div className="field">
          <label htmlFor="code">Προσωπικός κωδικός</label>
          <input id="code" name="code" type="password" autoComplete="current-password" required />
        </div>
        <button className="primary big" type="submit">Είσοδος</button>
      </form>
    </main>
  );
}
