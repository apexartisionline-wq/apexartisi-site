import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberIntake } from "@/lib/intake";
import { sessionJoinable, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatHour } from "@/lib/time";

async function accept() {
  "use server";
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const { consents } = await memberIntake(user);
  if (consents.confidentiality !== "YES") {
    await prisma.consent.create({
      data: { memberId: user.id, purpose: "confidentiality", choice: "YES", version: s.consentVersion, recordedById: user.id },
    });
  }
  redirect("/m/start");
}

const COMMITMENTS = [
  ["Ό,τι ακούω μένει εκεί.", "Δεν λέω σε κανέναν έξω ποιος είναι στο πρόγραμμα ή τι είπε. Μπορώ να μιλάω για τη δική μου εμπειρία, χωρίς να αναφέρω άλλους."],
  ["Δεν ηχογραφώ, δεν βιντεοσκοπώ, δεν τραβάω στιγμιότυπα οθόνης ή φωτογραφίες", "από συνεδρίες, και δεν καταγράφω ονόματα, πρόσωπα ή ό,τι ειπώθηκε."],
  ["Είμαι μόνος/η σε ιδιωτικό χώρο.", "Κανείς άλλος δεν βλέπει ή ακούει την οθόνη μου. Αν μπει κάποιος, κλείνω μικρόφωνο/κάμερα ή το λέω."],
  ["Αν αναγνωρίσω κάποιον", "που γνωρίζω, το λέω αμέσως ιδιωτικά στον συντονιστή ή στην υπεύθυνη."],
  ["Αν συναντήσω μέλος έξω,", "δεν τον/την χαιρετώ με τρόπο που δείχνει από πού γνωριζόμαστε, εκτός αν το κάνει πρώτος/η."],
  ["Στο Therapair", "κρατάω ό,τι είπε το άλλο μέλος ακόμη πιο προσεκτικά. Ο/η ψυχολόγος ή σύμβουλος γράφει ξεχωριστό σημείωμα για τον καθένα μας· τίποτα για μένα δεν μπαίνει στον φάκελο του άλλου."],
  ["Το υλικό του προγράμματος", "(κείμενα, βίντεο, ηχητικά, εργασίες) είναι μόνο για μένα· δεν το προωθώ."],
  ["Αν ανησυχώ σοβαρά για την ασφάλεια άλλου μέλους,", "αυτό δεν είναι παραβίαση: το λέω σε ψυχολόγο ή σύμβουλο της ομάδας. Αν κινδυνεύει άμεσα, καλώ 112."],
];

// Πρώτη σελίδα του μέλους μέχρι να ολοκληρωθεί η έναρξη συνεργασίας.
export default async function StartPage() {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const { status, consents } = await memberIntake(user);
  if (status.complete || !s.requireIntake) {
    return (
      <main>
        <h1>Καλώς ήρθες</h1>
        <div className="notice">Η έναρξη συνεργασίας ολοκληρώθηκε ✓</div>
        <Link className="btn primary big" href="/m">Συνέχεια</Link>
      </main>
    );
  }
  const accepted = consents.confidentiality === "YES";
  const now = new Date();
  // Η πρώτη ατομική γίνεται πριν ολοκληρωθεί η έναρξη· το κουμπί της φαίνεται εδώ.
  const next = await prisma.booking.findFirst({
    where: { memberId: user.id, slot: { startsAt: { gte: new Date(now.getTime() - s.pairMinutes * 60_000) } } },
    include: { slot: true },
    orderBy: { slot: { startsAt: "asc" } },
  });
  const hasProfile = Boolean(await prisma.memberProfile.findFirst({ where: { memberId: user.id }, select: { id: true } }));
  const withTeam = status.missingSteps.length > 0 || status.missingConsents.some((p) => !p.byMember);
  return (
    <main>
      <h1>Καλώς ήρθες, {user.name.split(" ")[0]}</h1>
      <p>Πριν ανοίξει όλο το app, ολοκληρώνουμε μαζί την έναρξη της συνεργασίας.</p>

      {next && (
        <section className="card row spread">
          <div>
            <strong>Η πρώτη σου συνάντηση</strong>
            <div className="muted">{formatDate(next.slot.date)} στις {formatHour(next.slot.hour)}</div>
          </div>
          <form action={`/m/join/${next.id}`} method="post">
            <button className="primary" disabled={!sessionJoinable(next.slot.startsAt, now, s, slotMinutes(next.slot.kind, s))}>Μπες</button>
          </form>
        </section>
      )}

      <Link className="card row spread" href="/m/profile" style={{ color: "inherit", textDecoration: "none" }}>
        <span>
          <strong>Πριν την 1η ατομική</strong>
          <div className="muted small">{hasProfile ? "Τα στοιχεία σου ✓ · μπορείς να τα αλλάξεις" : "Συμπλήρωσε λίγα στοιχεία για την ασφάλειά σου"}</div>
        </span>
        <span className="muted">›</span>
      </Link>

      <section className="card">
        <strong>Τι μένει</strong>
        <ul>
          {withTeam && <li>Η πρώτη συνάντηση με ψυχολόγο ή σύμβουλο της ομάδας (συμφωνητικό, συγκαταθέσεις, αξιολόγηση, πλάνο ασφάλειας).</li>}
          {!accepted && <li>Η δήλωση εμπιστευτικότητας, εδώ από κάτω.</li>}
        </ul>
        <p className="small muted">Μέχρι τότε έχεις το κόκκινο κουμπί, το πλάνο σου και τον λογαριασμό σου.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Δήλωση εμπιστευτικότητας</h2>
        <p>
          Στην ομάδα και στο Therapair οι άλλοι μοιράζονται πράγματα που δεν έχουν πει πουθενά αλλού. Αυτό γίνεται μόνο αν όλοι
          είμαστε σίγουροι ότι ό,τι λέγεται εκεί μένει εκεί.
        </p>
        <ol>
          {COMMITMENTS.map(([b, t]) => (
            <li key={b} style={{ marginBottom: 6 }}><strong>{b}</strong> {t}</li>
          ))}
        </ol>
        <p className="small muted">
          Η ομάδα μας δεν μπορεί να εγγυηθεί ότι όλα τα μέλη θα την τηρήσουν· γι' αυτό μοιράζεσαι όσα νιώθεις άνετα. Η δέσμευση ισχύει
          και μετά την ολοκλήρωση της συνεργασίας.
        </p>
        {accepted ? (
          <div className="notice">Την αποδέχτηκες ✓</div>
        ) : (
          <form action={accept}>
            <button className="primary big" type="submit">Τη διάβασα και δεσμεύομαι</button>
          </form>
        )}
      </section>
    </main>
  );
}
