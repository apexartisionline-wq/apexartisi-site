import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { InstallGuide } from "@/components/InstallGuide";
import { currentUser, homeFor } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Βάλε το Apex στο κινητό σου" };

// Ανοιχτή σελίδα (και χωρίς σύνδεση): τη βλέπει κανείς από την είσοδο, το email καλωσορίσματος, τον «Λογαριασμό»
// και την κάρτα του «Σήμερα». Ο θεραπευτής μπορεί να τη δείξει στο μέλος στην πρώτη ατομική.
export default async function InstallPage() {
  const [user, s] = await Promise.all([currentUser(), getSettings()]);
  return (
    <main className="install-page">
      <div className="install-inner">
        <div className="login-brand" role="img" aria-label={s.appName}>
          {s.logoUrl ? <img src={s.logoUrl} alt="" /> : <BrandMark className="login-mark" echo />}
          <span className="apex-word" aria-hidden="true">{s.appName}</span>
        </div>
        <h1>Βάλε το Apex στο κινητό σου</h1>
        <p className="muted">Δεν χρειάζεται App Store ή Google Play. Σε ένα λεπτό το Apex μπαίνει στην οθόνη σου και ανοίγει σαν κανονική εφαρμογή.</p>
        <InstallGuide />
        <p><Link className="btn" href={user ? homeFor(user.role) : "/login"}>{user ? "Πίσω στο Apex" : "Στην είσοδο"} ›</Link></p>
      </div>
    </main>
  );
}
