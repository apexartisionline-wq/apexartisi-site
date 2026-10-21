import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { memberNavOpts } from "@/lib/intake";
import { navLinks } from "@/lib/nav";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("MEMBER");
  // Ο κωδικός ήρθε με email (16/10): πριν από οτιδήποτε άλλο, το μέλος βάζει δικό του κωδικό.
  if (user.mustChangeCode) redirect("/account?first=1");
  // Μία πηγή για το μενού του μέλους (intake.ts): πλάνο, μηνύματα από την ομάδα, εκκρεμής έναρξη (τότε μόνο «Σήμερα» → έναρξη και «Λογαριασμός»).
  const { hasPlan, hasMessages, intakePending } = await memberNavOpts(user);
  return (
    <>
      <Nav links={navLinks("MEMBER", { hasPlan, hasMessages, intakePending })} compact />
      {/* Ίδιο φόντο, κάρτες και επικεφαλίδες με το περιβάλλον της ομάδας (16/10)· χωρίς το πλαϊνό μενού (έχει το λεκτικό
          «apex/rtisi», που δεν φτάνει στο κινητό των μελών — μόνο το ουδέτερο «Apex»). */}
      <div className="member-env">
        {/* Σε εκκρεμή έναρξη το «Σήμερα» είναι η έναρξη: το «‹ Πίσω» κρύβεται εκεί και γυρίζει εκεί από τις άλλες σελίδες. */}
        <BackButton home={intakePending ? "/m/start" : "/m"} />
        {children}
      </div>
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
    </>
  );
}
