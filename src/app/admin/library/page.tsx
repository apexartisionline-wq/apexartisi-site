import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, localParts } from "@/lib/time";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", LINK: "Σύνδεσμος" } as const;
const ERR: Record<string, string> = {
  title: "Χρειάζεται τίτλος.",
  type: "Μόνο PDF, ήχος ή βίντεο.",
  size: "Το αρχείο είναι πάνω από 40 MB. Για μεγάλο βίντεο βάλε σύνδεσμο.",
  url: "Ο σύνδεσμος πρέπει να ξεκινά με https://",
  empty: "Διάλεξε αρχείο ή γράψε σύνδεσμο.",
};

async function toggle(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const item = await prisma.libraryItem.findUniqueOrThrow({ where: { id }, select: { published: true } });
  await prisma.libraryItem.update({ where: { id }, data: { published: !item.published } });
  redirect("/admin/library");
}

async function remove(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.libraryItem.delete({ where: { id: String(formData.get("id")) } });
  redirect("/admin/library");
}

export default async function AdminLibrary({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const items = await prisma.libraryItem.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, title: true, size: true, url: true, published: true, createdAt: true },
  });
  return (
    <>
      <h1>Βιβλιοθήκη</h1>
      <p className="muted">
        Υλικό για όλα τα μέλη. Ανοίγει μόνο μέσα στο app, με το κωδικό του μέλους πάνω στην προβολή.
        Οι προσωπικές εργασίες δίνονται από την καρτέλα κάθε μέλους.
      </p>
      {sp.ok && <div className="notice">Προστέθηκε ✓</div>}
      {sp.e && <div className="error">{ERR[sp.e] ?? "Κάτι πήγε στραβά."}</div>}
      <form action="/api/library" method="post" encType="multipart/form-data" className="card">
        <div className="field">
          <label htmlFor="title">Τίτλος</label>
          <input id="title" name="title" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="description">Περιγραφή (προαιρετικό)</label>
          <textarea id="description" name="description" maxLength={2000} />
        </div>
        <div className="field">
          <label htmlFor="file">Αρχείο (PDF, ήχος ή βίντεο, έως 40 MB)</label>
          <input id="file" name="file" type="file" accept="application/pdf,audio/*,video/*" />
        </div>
        <div className="field">
          <label htmlFor="url">ή σύνδεσμος (π.χ. μεγάλο βίντεο)</label>
          <input id="url" name="url" type="url" placeholder="https://" />
        </div>
        <button className="primary" type="submit">Προσθήκη</button>
      </form>
      {items.length > 0 && (
        <table>
          <thead>
            <tr><th>Ημερομηνία</th><th>Είδος</th><th>Τίτλος</th><th>Μέγεθος</th><th>Ορατό</th><th /></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.published ? undefined : "muted"}>
                <td>{formatDate(localParts(i.createdAt).date)}</td>
                <td>{KIND[i.kind]}</td>
                <td>{i.kind === "LINK" ? <a href={i.url ?? "#"} target="_blank" rel="noopener noreferrer">{i.title}</a> : <a href={`/api/library/${i.id}`}>{i.title}</a>}</td>
                <td>{i.size ? `${(i.size / 1024 / 1024).toFixed(1)} MB` : "—"}</td>
                <td>
                  <form action={toggle}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" style={{ padding: "4px 8px" }}>{i.published ? "Ναι · απόκρυψη" : "Όχι · εμφάνιση"}</button>
                  </form>
                </td>
                <td>
                  <form action={remove}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" style={{ padding: "4px 8px" }}>Διαγραφή</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
