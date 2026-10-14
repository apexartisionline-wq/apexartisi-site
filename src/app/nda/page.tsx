import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Pill } from "@/components/ui";
import { logAccess } from "@/lib/audit";
import { homeFor, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NDA_MAX_BYTES, NDA_MIMES, ndaStatus, SIGNED_HOW } from "@/lib/nda";
import { getSettings } from "@/lib/settings";
import { formatWhen } from "@/lib/time";

// Σελίδα του εντύπου εχεμύθειας για το προσωπικό (απόφαση 14/10). Είναι ΕΚΤΟΣ των μενού θεραπευτή/διαχείρισης,
// ώστε να ανοίγει και όταν η πρόσβαση είναι ακόμα κλειστή. Βήμα 1: διάβασμα και ψηφιακή αποδοχή της έκδοσης.
// Βήμα 2: ανέβασμα του υπογεγραμμένου αρχείου (gov.gr ή σάρωση) — το κύριο αποδεικτικό.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function accept(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const st = await ndaStatus(user);
  if (!st.doc || st.exempt) redirect("/nda");
  if (st.consent) redirect("/nda?ok=1");
  const typedName = String(formData.get("typedName") ?? "").trim();
  const agreed = formData.get("agree") === "on";
  if (!agreed) redirect("/nda?e=agree");
  // Το όνομα πρέπει να είναι το όνομα του λογαριασμού (χωρίς τόνους/κεφαλαία, χωρίς την παρένθεση των ψεύτικων στοιχείων).
  const expected = norm(user.name.replace(/\(.*?\)/g, ""));
  if (typedName.length < 3 || norm(typedName) !== expected) redirect("/nda?e=name");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const userAgent = (h.get("user-agent") ?? "").slice(0, 300);
  await prisma.staffConsent.create({ data: { userId: user.id, documentId: st.doc.id, typedName, ip, userAgent } });
  await logAccess(user.id, null, "nda_accept");
  redirect("/nda?ok=1");
}

async function uploadSigned(formData: FormData) {
  "use server";
  const user = await requireRole("THERAPIST", "ADMIN");
  const st = await ndaStatus(user);
  if (!st.doc || !st.consent) redirect("/nda");
  const file = formData.get("signed");
  const how = String(formData.get("how") ?? "");
  if (!(file instanceof File) || file.size === 0) redirect("/nda?e=file");
  if (file.size > NDA_MAX_BYTES) redirect("/nda?e=size");
  if (!NDA_MIMES.includes(file.type)) redirect("/nda?e=type");
  if (how !== "GOV" && how !== "SCAN") redirect("/nda?e=how");
  await prisma.staffConsent.update({
    where: { id: st.consent.id },
    data: { signedFile: new Uint8Array(await file.arrayBuffer()), signedMime: file.type, signedFileName: file.name.slice(0, 120), signedHow: how, signedAt: new Date(), signedById: user.id },
  });
  await logAccess(user.id, null, "nda_signed_upload");
  redirect("/nda?ok=2");
}

const ERR: Record<string, string> = {
  agree: "Για να συνεχίσεις, τσέκαρε ότι διάβασες και αποδέχεσαι το έντυπο.",
  name: "Γράψε το ονοματεπώνυμό σου όπως είναι στον λογαριασμό σου.",
  file: "Διάλεξε το υπογεγραμμένο αρχείο.",
  size: "Το αρχείο ξεπερνά τα 10 MB.",
  type: "Δεκτά αρχεία: PDF, JPG, PNG.",
  how: "Πες μας πώς υπογράφηκε (gov.gr ή σάρωση).",
};

export default async function NdaPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string; file?: string }> }) {
  const user = await requireRole("THERAPIST", "ADMIN");
  const sp = await searchParams;
  const [st, s] = await Promise.all([ndaStatus(user), getSettings()]);
  const home = homeFor(user.role);
  const open = !st.needsAccept && !(st.needsFile && s.ndaRequireFile);
  return (
    <>
      <Nav links={open ? [{ href: home, label: "Σήμερα" }, { href: "/account", label: "Λογαριασμός" }] : [{ href: "/account", label: "Λογαριασμός" }]} />
      <main>
        <h1>Έντυπο εχεμύθειας</h1>
        {!st.doc ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>Δεν έχει ανέβει ακόμα έντυπο εχεμύθειας. Δεν χρειάζεται να κάνεις κάτι.</p><p style={{ margin: "10px 0 0" }}><Link className="btn" href={home}>Συνέχεια ›</Link></p></div>
        ) : st.exempt ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>Ο λογαριασμός σου εξαιρείται από την υπογραφή του εντύπου (υπεύθυνη).</p><p style={{ margin: "10px 0 0" }}><Link className="btn" href={home}>Συνέχεια ›</Link></p></div>
        ) : (
          <>
            {sp.e && ERR[sp.e] && <div className="error">{ERR[sp.e]}</div>}
            {sp.ok === "1" && <div className="notice">Η αποδοχή καταγράφηκε ✓ {!st.signed && "Μένει το υπογεγραμμένο αρχείο (βήμα 2)."}</div>}
            {sp.ok === "2" && <div className="notice">Το υπογεγραμμένο αρχείο ανέβηκε ✓</div>}
            {!st.accepted && (
              <p className="hint">
                Για να πάρεις πρόσβαση στην εφαρμογή, πρέπει πρώτα να διαβάσεις και να αποδεχθείς το έντυπο εχεμύθειας (έκδοση {st.doc.version}). Μετά θα σου ζητηθεί και το υπογεγραμμένο αρχείο: ψηφιακά μέσω gov.gr ή υπογεγραμμένο στο χέρι και σκαναρισμένο.
              </p>
            )}

            <section className="card" data-tour="nda-doc">
              <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
                <strong>{st.doc.title} <span className="muted small">· έκδοση {st.doc.version} · {formatWhen(st.doc.createdAt)}</span></strong>
                <a className="btn outline sm" href={`/api/nda/doc/${st.doc.id}`} target="_blank" rel="noopener noreferrer">Άνοιγμα / λήψη</a>
              </div>
              {st.doc.note && <p className="muted small" style={{ margin: "6px 0 0" }}>{st.doc.note}</p>}
              {st.doc.mime === "application/pdf" && (
                <iframe src={`/api/nda/doc/${st.doc.id}`} title={st.doc.title} style={{ width: "100%", height: "min(70vh, 720px)", border: "1px solid var(--line)", borderRadius: 8, marginTop: 10 }} />
              )}
            </section>

            <h2>1. Ψηφιακή αποδοχή</h2>
            {st.consent ? (
              <div className="card">
                <Pill tone="ok">Αποδέχθηκες την έκδοση {st.doc.version}</Pill>
                <div className="muted small" style={{ marginTop: 6 }}>{formatWhen(st.consent.acceptedAt)} · ως «{st.consent.typedName}» · από τον λογαριασμό @{user.username}</div>
              </div>
            ) : (
              <form action={accept} className="card stack" data-tour="nda-accept">
                <label className="field">
                  Ονοματεπώνυμο (όπως στον λογαριασμό σου: {user.name.replace(/\(.*?\)/g, "").trim()})
                  <input name="typedName" required minLength={3} maxLength={120} autoComplete="name" />
                </label>
                <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" name="agree" required style={{ width: "auto", marginTop: 4 }} />
                  <span>Διάβασα το έντυπο εχεμύθειας (έκδοση {st.doc.version}) και το αποδέχομαι. Καταγράφεται το όνομα, η ώρα, ο λογαριασμός και η διεύθυνση σύνδεσης.</span>
                </label>
                <div><button className="primary" type="submit">Αποδέχομαι</button></div>
              </form>
            )}

            <h2>2. Υπογεγραμμένο αρχείο</h2>
            <p className="hint" style={{ marginTop: -6 }}>
              Το κύριο αποδεικτικό. Ή υπογράφεις το PDF ψηφιακά στο <a href="https://docs.gov.gr" target="_blank" rel="noopener noreferrer">gov.gr</a> (ψηφιακή βεβαίωση εγγράφου, με κωδικούς TaxisNet) και ανεβάζεις το αρχείο που βγαίνει, ή το τυπώνεις, το υπογράφεις, το σκανάρεις (ή το φωτογραφίζεις καθαρά) και το ανεβάζεις. Μπορείς και να το δώσεις στο χέρι στη διαχείριση, που θα το σημειώσει.
            </p>
            {st.signed && st.consent ? (
              <div className="card">
                <Pill tone="ok">Υπάρχει υπογεγραμμένο αρχείο</Pill>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {SIGNED_HOW[st.consent.signedHow ?? ""] ?? st.consent.signedHow} · {st.consent.signedAt && formatWhen(st.consent.signedAt)}
                  {st.consent.signedFileName && <> · <a href={`/api/nda/signed/${st.consent.id}`} target="_blank" rel="noopener noreferrer">{st.consent.signedFileName}</a></>}
                  {st.consent.signedNote && <> · {st.consent.signedNote}</>}
                </div>
              </div>
            ) : st.consent ? (
              <form action={uploadSigned} className="card stack" encType="multipart/form-data" data-tour="nda-upload">
                {sp.file && <div className="notice">Για να ανοίξει η πρόσβαση χρειάζεται και το υπογεγραμμένο αρχείο.</div>}
                <Pill tone="yellow">Εκκρεμεί υπογεγραμμένο αρχείο</Pill>
                <label className="field">
                  Πώς υπογράφηκε
                  <select name="how" required defaultValue="">
                    <option value="" disabled>—</option>
                    <option value="GOV">Ψηφιακά στο gov.gr</option>
                    <option value="SCAN">Στο χέρι, σκαναρισμένο ή φωτογραφία</option>
                  </select>
                </label>
                <label className="field">
                  Αρχείο (PDF, JPG ή PNG, ως 10 MB)
                  <input type="file" name="signed" accept="application/pdf,image/jpeg,image/png" required />
                </label>
                <div><button className="primary" type="submit">Ανέβασμα</button></div>
              </form>
            ) : (
              <div className="card"><p className="muted" style={{ margin: 0 }}>Πρώτα η ψηφιακή αποδοχή (βήμα 1).</p></div>
            )}

            {open && (
              <p style={{ marginTop: 16 }}><Link className="btn primary" href={home}>Συνέχεια στην εφαρμογή ›</Link></p>
            )}
          </>
        )}
      </main>
    </>
  );
}
