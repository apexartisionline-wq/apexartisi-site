import Link from "next/link";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";
import { formatDate, localParts } from "@/lib/time";

const KIND = { PDF: "PDF", AUDIO: "Ήχος", VIDEO: "Βίντεο", LINK: "Βίντεο" } as const;

export default async function MemberLibrary() {
  const user = await requireMember();
  const [mine, shared] = await Promise.all([
    prisma.assignment.findMany({ where: { memberId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, createdAt: true, answeredAt: true } }),
    prisma.libraryItem.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, description: true } }),
  ]);
  return (
    <main>
      <h1>Βιβλιοθήκη</h1>
      <h2>Οι εργασίες μου</h2>
      {mine.length === 0 ? (
        <p className="muted">Δεν έχεις εργασίες ακόμα.</p>
      ) : (
        <div className="stack">
          {mine.map((a) => (
            <Link key={a.id} href={`/m/library/a/${a.id}`} className="card row spread">
              <span><strong>{a.title}</strong><br /><span className="small muted">{formatDate(localParts(a.createdAt).date)}</span></span>
              <span className="small">{a.answeredAt ? "✓ απαντήθηκε" : "να τη γράψω"}</span>
            </Link>
          ))}
        </div>
      )}
      <h2>Για όλους</h2>
      {shared.length === 0 ? (
        <p className="muted">Δεν υπάρχει υλικό ακόμα.</p>
      ) : (
        <div className="stack">
          {shared.map((i) => (
            <Link key={i.id} href={`/m/library/${i.id}`} className="card">
              <span className="small muted">{KIND[i.kind]}</span><br />
              <strong>{i.title}</strong>
              {i.description && <p className="small" style={{ margin: "4px 0 0" }}>{i.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
