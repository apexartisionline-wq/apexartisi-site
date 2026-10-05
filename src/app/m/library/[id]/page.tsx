import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/intake";
import { prisma } from "@/lib/db";

// Προβολή μόνο μέσα στο app, με το κωδικό του μέλους πάνω στο υλικό (αποτρεπτικό, όχι κλείδωμα).
export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const item = await prisma.libraryItem.findFirst({
    where: { id, published: true },
    select: { id: true, kind: true, title: true, description: true, url: true },
  });
  if (!item) notFound();
  const mark = `Προσωπικό αντίγραφο · ${user.memberCode ?? user.name}`;
  const src = `/api/library/${item.id}`;
  return (
    <main>
      <p><Link className="back" href="/m/library">‹ Βιβλιοθήκη</Link></p>
      <h1>{item.title}</h1>
      {item.description && <p>{item.description}</p>}
      <div className="watermarked" data-mark={mark}>
        {item.kind === "AUDIO" && <audio controls controlsList="nodownload" preload="metadata" src={src} style={{ width: "100%" }} />}
        {item.kind === "VIDEO" && (
          <video controls controlsList="nodownload" disablePictureInPicture preload="metadata" src={src} style={{ width: "100%" }} playsInline />
        )}
        {item.kind === "PDF" && <a className="btn primary big" href={src}>Άνοιγμα</a>}
        {item.kind === "LINK" && item.url && (
          <a className="btn primary big" href={item.url} target="_blank" rel="noopener noreferrer">Άνοιγμα βίντεο</a>
        )}
      </div>
      <p className="small muted">Το υλικό είναι για τη δική σου χρήση μέσα στο πρόγραμμα. Σε παρακαλούμε μην το μοιράζεσαι.</p>
    </main>
  );
}
