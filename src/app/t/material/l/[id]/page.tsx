import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Υλικό της κοινής βιβλιοθήκης, όπως το βλέπει το μέλος (μέσα στο app, όχι λήψη).
export default async function TherapistLibraryItem({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("THERAPIST", "ADMIN");
  const { id } = await params;
  const item = await prisma.libraryItem.findFirst({ where: { id, published: true }, select: { id: true, kind: true, title: true, description: true, url: true } });
  if (!item) notFound();
  const src = `/api/library/${item.id}`;
  return (
    <main>
      <p className="small"><Link className="back" href="/t/material">‹ Υλικό</Link></p>
      <h1>{item.title}</h1>
      {item.description && <p>{item.description}</p>}
      {item.kind === "AUDIO" && <audio controls controlsList="nodownload" preload="metadata" src={src} style={{ width: "100%" }} />}
      {item.kind === "VIDEO" && <video controls controlsList="nodownload" disablePictureInPicture preload="metadata" src={src} style={{ width: "100%" }} playsInline />}
      {item.kind === "PDF" && <p><a className="btn primary big" href={src}>Άνοιγμα</a></p>}
      {item.kind === "LINK" && item.url && <p><a className="btn primary big" href={item.url} target="_blank" rel="noopener noreferrer">Άνοιγμα βίντεο</a></p>}
      <p className="small muted">Το ίδιο υλικό βλέπουν όλα τα μέλη στη «Βιβλιοθήκη» τους.</p>
    </main>
  );
}
