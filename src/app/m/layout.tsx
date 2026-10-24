import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { MemberTabs } from "@/components/MemberTabs";
import { Nav } from "@/components/Nav";
import { requireRole } from "@/lib/auth";
import { memberNavOpts } from "@/lib/intake";
import { navLinks } from "@/lib/nav";
import { PALETTE_COOKIE } from "@/lib/palette";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("MEMBER");
  // Ο κωδικός ήρθε με email (16/10): πριν από οτιδήποτε άλλο, το μέλος βάζει δικό του κωδικό.
  if (user.mustChangeCode) redirect("/account?first=1");
  // Μία πηγή για το μενού του μέλους (intake.ts): πλάνο, μηνύματα από την ομάδα, εκκρεμής έναρξη (τότε μόνο «Σήμερα» → έναρξη και «Λογαριασμός»).
  const { hasPlan, hasMessages, intakePending } = await memberNavOpts(user);
  const links = navLinks("MEMBER", { hasPlan, hasMessages, intakePending });
  // «Δώσε ζωή σε όλες τις καρτέλες» (υπεύθυνη 23/10): ζωντανή εμφάνιση σε όλες τις σελίδες του μέλους· παλέτα brand ή
  // «όπως οι φωτογραφίες» (προς απόφαση) από τον διακόπτη του «Σήμερα» (cookie, /m/xr).
  const foto = (await cookies()).get(PALETTE_COOKIE)?.value === "foto";
  return (
    <>
      <Nav links={links} compact />
      {/* Ίδιο φόντο, κάρτες και επικεφαλίδες με το περιβάλλον της ομάδας (16/10)· χωρίς το πλαϊνό μενού (έχει το λεκτικό
          «apex/rtisi», που δεν φτάνει στο κινητό των μελών — μόνο το ουδέτερο «Apex»). */}
      <div className={`member-env live${foto ? " xr-foto" : ""}`}>
        {/* Σε εκκρεμή έναρξη το «Σήμερα» είναι η έναρξη: το «‹ Πίσω» κρύβεται εκεί και γυρίζει εκεί από τις άλλες σελίδες. */}
        <BackButton home={intakePending ? "/m/start" : "/m"} />
        {children}
      </div>
      {/* Υπολογιστής: η κόκκινη μπάρα κάτω. Κινητό: η κάτω μπάρα πλοήγησης με το κόκκινο κουμπί στο κέντρο (21/10, εγκρίθηκε 22/10). */}
      <div className="redbar">
        <Link href="/m/help" className="btn red big">Κόκκινο κουμπί</Link>
      </div>
      <MemberTabs links={links} />
    </>
  );
}
