import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill } from "@/components/ui";
import { logAccess } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NDA_MAX_BYTES, NDA_STATE, ndaOverview, SIGNED_HOW } from "@/lib/nda";
import { getSettings } from "@/lib/settings";
import { formatWhen } from "@/lib/time";

// «Εχεμύθεια» (διαχείριση, απόφαση 14/10): ανέβασμα του εντύπου του δικηγόρου (έκδοση), φάκελος ανά συνεργάτη
// (αποδοχή, υπογεγραμμένο αρχείο, πρωτότυπο σε χαρτί, εξαίρεση). Το κείμενο του εντύπου δεν μπαίνει στον κώδικα.
async function uploadDoc(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120) || "Έντυπο εχεμύθειας";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!(file instanceof File) || file.size === 0) redirect("/admin/nda?e=file");
  if (file.size > NDA_MAX_BYTES) redirect("/admin/nda?e=size");
  if (file.type !== "application/pdf") redirect("/admin/nda?e=type");
  const last = await prisma.staffDocument.findFirst({ where: { kind: "NDA" }, orderBy: { version: "desc" }, select: { version: true } });
  await prisma.staffDocument.create({ data: { kind: "NDA", version: (last?.version ?? 0) + 1, title, note, fileName: file.name.slice(0, 120), mime: file.type, file: new Uint8Array(await file.arrayBuffer()), uploadedById: admin.id } });
  await logAccess(admin.id, null, "nda_doc_upload");
  redirect("/admin/nda?ok=doc");
}

async function paper(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const { doc } = await ndaOverview();
  if (!doc) redirect("/admin/nda");
  const c = await prisma.staffConsent.findUnique({ where: { userId_documentId: { userId, documentId: doc.id } }, select: { id: true, signedAt: true } });
  if (!c || c.signedAt) redirect("/admin/nda");
  await prisma.staffConsent.update({ where: { id: c.id }, data: { signedHow: "PAPER", signedAt: new Date(), signedById: admin.id, signedNote: note } });
  await logAccess(admin.id, null, "nda_paper");
  redirect("/admin/nda?ok=paper");
}

async function exempt(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const on = formData.get("on") === "1";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!u || u.role === "MEMBER") redirect("/admin/nda");
  await prisma.user.update({ where: { id: userId }, data: { ndaExempt: on } });
  await logAccess(admin.id, null, "nda_exempt");
  redirect("/admin/nda?ok=exempt");
}

const ERR: Record<string, string> = { file: "Διάλεξε αρχείο.", size: "Το αρχείο ξεπερνά τα 10 MB.", type: "Το έντυπο ανεβαίνει ως PDF." };
const OK: Record<string, string> = { doc: "Η νέα έκδοση ανέβηκε ✓ Όλοι οι συνεργάτες θα την αποδεχθούν ξανά στην επόμενη είσοδο.", paper: "Σημειώθηκε η παραλαβή σε χαρτί ✓", exempt: "Η εξαίρεση άλλαξε ✓" };

export default async function NdaAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const admin = await requireRole("ADMIN");
  const sp = await searchParams;
  const [{ doc, rows }, versions, s] = await Promise.all([
    ndaOverview(),
    prisma.staffDocument.findMany({ where: { kind: "NDA" }, orderBy: { version: "desc" }, omit: { file: true } }),
    getSettings(),
  ]);
  const uploaders = new Map((await prisma.user.findMany({ where: { id: { in: versions.map((v) => v.uploadedById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const pending = rows.filter((r) => r.state === "none" || r.state === "accepted");
  return (
    <>
      <p className="crumbs"><Link href="/admin/people">Άνθρωποι</Link> / Εχεμύθεια</p>
      <h1>Έντυπο εχεμύθειας</h1>
      <p className="hint">
        Κάθε λογαριασμός προσωπικού (θεραπευτές και τυχόν αναπληρωτής της διαχείρισης) αποδέχεται το έντυπο στην πρώτη είσοδο και ανεβάζει το υπογεγραμμένο αρχείο (gov.gr ή σάρωση) — ή το παραδίδει σε χαρτί και το σημειώνεις εδώ. Η υπεύθυνη εξαιρείται (όποιος ανεβάζει την έκδοση, και όποιος εξαιρεθεί ρητά). {s.ndaRequireFile ? "Ρύθμιση: η πρόσβαση ανοίγει μόνο με υπογεγραμμένο αρχείο." : "Ρύθμιση: η πρόσβαση ανοίγει με την ψηφιακή αποδοχή· το αρχείο μένει «εκκρεμεί» ώσπου να ανέβει."} <Link href="/admin/settings">Ρυθμίσεις ›</Link>
      </p>
      {sp.e && ERR[sp.e] && <div className="error">{ERR[sp.e]}</div>}
      {sp.ok && OK[sp.ok] && <div className="notice">{OK[sp.ok]}</div>}

      <h2>Ισχύουσα έκδοση</h2>
      {doc ? (
        <div className="card">
          <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
            <strong>{doc.title} <span className="muted small">· έκδοση {doc.version} · {formatWhen(doc.createdAt)} · {uploaders.get(doc.uploadedById) ?? "—"}</span></strong>
            <a className="btn outline sm" href={`/api/nda/doc/${doc.id}`} target="_blank" rel="noopener noreferrer">Άνοιγμα</a>
          </div>
          {doc.note && <p className="muted small" style={{ margin: "6px 0 0" }}>{doc.note}</p>}
          {versions.length > 1 && (
            <details className="small" style={{ marginTop: 8 }}>
              <summary>Προηγούμενες εκδόσεις ({versions.length - 1})</summary>
              <ul>{versions.slice(1).map((v) => <li key={v.id}>έκδοση {v.version} · {v.title} · {formatWhen(v.createdAt)} · <a href={`/api/nda/doc/${v.id}`} target="_blank" rel="noopener noreferrer">άνοιγμα</a></li>)}</ul>
            </details>
          )}
        </div>
      ) : (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Δεν έχει ανέβει έντυπο. Μέχρι να ανέβει, η εφαρμογή δεν ζητά τίποτα από κανέναν.</p></div>
      )}
      <details className="card" open={!doc} data-tour="nda-upload-doc">
        <summary>{doc ? "Ανέβασμα νέας έκδοσης (όλοι θα την αποδεχθούν ξανά)" : "Ανέβασμα του εντύπου του δικηγόρου"}</summary>
        <form action={uploadDoc} className="stack" encType="multipart/form-data" style={{ marginTop: 10 }}>
          <label className="field">Τίτλος<input name="title" defaultValue="Έντυπο εχεμύθειας" maxLength={120} /></label>
          <label className="field">Τι άλλαξε (προαιρετικό)<input name="note" maxLength={500} placeholder="π.χ. πρώτη έκδοση από τον δικηγόρο, 14/10/2026" /></label>
          <label className="field">Αρχείο PDF (ως 10 MB)<input type="file" name="file" accept="application/pdf" required /></label>
          <div><button className="primary" type="submit">Ανέβασμα</button></div>
        </form>
      </details>

      <h2>Φάκελος συνεργατών {doc && pending.length > 0 && <Pill tone="yellow">{pending.length} εκκρεμ{pending.length === 1 ? "εί" : "ούν"}</Pill>}</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Συνεργάτης</th><th>Κατάσταση</th><th>Αποδοχή</th><th>Υπογεγραμμένο</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ user: u, consent: c, state, exempt: ex }) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                <td><Link href={`/admin/people/${u.id}`}>{u.name}</Link> <span className="muted small">@{u.username} · {u.role === "ADMIN" ? "διαχείριση" : "θεραπευτής"}{!u.active && " · ανενεργός"}</span></td>
                <td><Pill tone={NDA_STATE[state].tone}>{doc ? NDA_STATE[state].text : ex ? "Εξαιρείται" : "—"}</Pill></td>
                <td className="small">{c ? <>{formatWhen(c.acceptedAt)}<br /><span className="muted">ως «{c.typedName}» · IP {c.ip}</span></> : <span className="muted">—</span>}</td>
                <td className="small">
                  {c?.signedAt ? (
                    <>{SIGNED_HOW[c.signedHow ?? ""] ?? c.signedHow} · {formatWhen(c.signedAt)}{c.signedFileName && <> · <a href={`/api/nda/signed/${c.id}`} target="_blank" rel="noopener noreferrer">{c.signedFileName}</a></>}{c.signedNote && <> · {c.signedNote}</>}</>
                  ) : c ? (
                    <form action={paper} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input name="note" placeholder="π.χ. πρωτότυπο στον φάκελο γραφείου" maxLength={300} style={{ minWidth: 180 }} />
                      <button type="submit" className="sm">Παρέλαβα σε χαρτί</button>
                    </form>
                  ) : <span className="muted">—</span>}
                </td>
                <td>
                  {u.id !== admin.id && (
                    <form action={exempt}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="on" value={u.ndaExempt ? "0" : "1"} />
                      <button type="submit" className="sm outline">{u.ndaExempt ? "Άρση εξαίρεσης" : "Εξαίρεση"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Οι συναινέσεις δεν σβήνονται· σε νέα έκδοση προστίθεται νέα γραμμή. Κάθε άνοιγμα του εντύπου ή υπογεγραμμένου αρχείου καταγράφεται στην «Πρόσβαση».</p>
    </>
  );
}
