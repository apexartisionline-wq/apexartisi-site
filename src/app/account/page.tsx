import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { hashPassword, logoutEverywhere, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { navLinks } from "@/lib/nav";

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

const ERRORS: Record<string, string> = {
  current: "Ο τωρινός κωδικός δεν είναι σωστός.",
  short: "Ο νέος κωδικός θέλει τουλάχιστον 8 χαρακτήρες.",
  match: "Οι δύο νέοι κωδικοί δεν είναι ίδιοι.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const user = await requireRole("MEMBER", "THERAPIST", "ADMIN");
  const sp = await searchParams;
  return (
    <>
      <Nav links={navLinks(user.role)} />
      <main>
        <h1>Ο λογαριασμός μου</h1>
        <div className="card">
          <div>{user.name}</div>
          <div className="muted small">@{user.username} · {ROLE[user.role]}</div>
        </div>
        <h2>Αλλαγή κωδικού</h2>
        {sp.ok && <div className="notice">Ο κωδικός άλλαξε ✓</div>}
        {sp.e && ERRORS[sp.e] && <div className="error">{ERRORS[sp.e]}</div>}
        <form action={changeCode} className="card">
          <div className="field"><label htmlFor="current">Τωρινός κωδικός</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="next">Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required /></div>
          <div className="field"><label htmlFor="again">Ξανά ο νέος κωδικός</label><input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required /></div>
          <button className="primary" type="submit">Αλλαγή</button>
        </form>
        <h2>Συσκευές</h2>
        <form action={signOutAll} className="card row spread">
          <span>Αν χάθηκε ή δόθηκε το κινητό σου, αποσυνδέσου από όλες τις συσκευές.</span>
          <button type="submit">Αποσύνδεση παντού</button>
        </form>
      </main>
    </>
  );
}
