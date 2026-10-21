import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHead, Panel } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberIntake } from "@/lib/intake";
import { sessionJoinable, slotMinutes } from "@/lib/program";
import { getSettings } from "@/lib/settings";
import { formatDate, formatTime } from "@/lib/time";
import { vocative } from "@/lib/vocative";

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
  ["Δεν ηχογραφώ, δεν βιντεοσκοπώ, δεν τραβάω στιγμιότυπα οθόνης ή φωτογραφίες", "από ομάδες και ατομικές, και δεν καταγράφω ονόματα, πρόσωπα ή ό,τι ειπώθηκε."],
  ["Βρίσκομαι σε ιδιωτικό χώρο, χωρίς άλλους.", "Κανείς άλλος δεν βλέπει ή ακούει την οθόνη μου. Αν μπει κάποιος, κλείνω μικρόφωνο/κάμερα ή το λέω."],
  ["Αν αναγνωρίσω κάποιον", "που γνωρίζω, το λέω αμέσως ιδιωτικά σε ψυχολόγο ή σύμβουλο της ομάδας, ή στην υπεύθυνη."],
  ["Αν συναντήσω μέλος έξω,", "δεν χαιρετώ με τρόπο που δείχνει από πού γνωριζόμαστε, εκτός αν ξεκινήσει το άλλο μέλος."],
  ["Στο Therapair", "κρατάω ό,τι είπε το άλλο μέλος ακόμη πιο προσεκτικά. Η ομάδα γράφει ξεχωριστό σημείωμα για τον καθένα μας· τίποτα για μένα δεν μπαίνει στον φάκελο του άλλου."],
  ["Το υλικό του προγράμματος", "(κείμενα, βίντεο, ηχητικά, εργασίες) είναι μόνο για μένα· δεν το προωθώ."],
  ["Αν ανησυχώ σοβαρά για την ασφάλεια άλλου μέλους,", "αυτό δεν είναι παραβίαση: το λέω σε ψυχολόγο ή σύμβουλο της ομάδας. Αν κινδυνεύει άμεσα, καλώ το 112."],
];

// Πρώτη σελίδα του μέλους μέχρι να ολοκληρωθεί η έναρξη συνεργασίας.
export default async function StartPage() {
  const user = await requireRole("MEMBER");
  const s = await getSettings();
  const { status, consents } = await memberIntake(user);
  if (status.complete || !s.requireIntake) {
    return (
      <main>
        <PageHead title="Καλώς ήρθες" />
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
      <PageHead title={`Καλώς ήρθες, ${vocative(user.name.split(" ")[0])}`} sub="Πριν ανοίξει όλο το Apex, ολοκληρώνουμε μαζί την έναρξη της συνεργασίας." />

      {next && (
        <Panel title="Η πρώτη σου ατομική" icon="user">
          <div className="m-row">
            <div className="grow">
              <strong>{formatDate(next.slot.date)} στις {formatTime(next.slot.startsAt)}</strong>
              {!sessionJoinable(next.slot.startsAt, now, s, slotMinutes(next.slot.kind, s)) && <div className="hint">Το κουμπί ανοίγει {s.sessionJoinBeforeMinutes} λεπτά πριν.</div>}
            </div>
            <form action={`/m/join/${next.id}`} method="post">
              <button className="primary" disabled={!sessionJoinable(next.slot.startsAt, now, s, slotMinutes(next.slot.kind, s))}>Μπες στην ατομική σου</button>
            </form>
          </div>
        </Panel>
      )}

      <Link className="linkrow panel" href="/m/profile">
        <span className="iconbox"><Icon name={hasProfile ? "check" : "shield"} size={20} /></span>
        <span className="grow">
          <div style={{ fontWeight: 600 }}>Πριν την 1η ατομική</div>
          <div className="hint">{hasProfile ? "Τα στοιχεία σου ✓ · μπορείς να τα αλλάξεις" : "Συμπλήρωσε λίγα στοιχεία για την ασφάλειά σου"}</div>
        </span>
        <span className="arrow"><Icon name="chevron" /></span>
      </Link>

      <Panel title="Τι μένει" icon="list">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {/* Από 16/10 την 1η ατομική την έχει όποιος θεραπευτής έχει την ατομική (όχι μόνο ψυχολόγος)· διατύπωση προς έγκριση. */}
          {withTeam && <li>Η πρώτη ατομική με την ομάδα σου (συμφωνητικό, συγκαταθέσεις, ιστορικό).</li>}
          {!accepted && <li>Η δήλωση εμπιστευτικότητας, εδώ παρακάτω.</li>}
        </ul>
        <p className="hint" style={{ margin: "8px 0 0" }}>Μέχρι τότε έχεις το κόκκινο κουμπί και τον λογαριασμό σου.</p>
      </Panel>

      <Panel title="Δήλωση εμπιστευτικότητας" icon="shield">
        <p style={{ marginTop: 0 }}>
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
          <div className="notice" style={{ marginBottom: 0 }}>Την αποδέχτηκες ✓</div>
        ) : (
          <form action={accept}>
            <button className="primary big" type="submit">Τη διάβασα και δεσμεύομαι</button>
          </form>
        )}
      </Panel>
    </main>
  );
}
