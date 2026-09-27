import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { kindFromMime, LIBRARY_MAX_BYTES } from "@/lib/library";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/admin/library?${q}`, req.url), 303);

// Ανέβασμα στην κοινή βιβλιοθήκη (μόνο η Εύα): αρχείο PDF/ήχου/βίντεο ή σύνδεσμος.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse(null, { status: 401 });
  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const description = String(form.get("description") ?? "").slice(0, 2000);
  const url = String(form.get("url") ?? "").trim();
  const file = form.get("file");
  if (!title) return back(req, "e=title");

  if (file instanceof File && file.size > 0) {
    const kind = kindFromMime(file.type);
    if (!kind) return back(req, "e=type");
    if (file.size > LIBRARY_MAX_BYTES) return back(req, "e=size");
    const data = new Uint8Array(await file.arrayBuffer());
    await prisma.libraryItem.create({ data: { kind, title, description, mime: file.type, data, size: data.length, createdById: user.id } });
    return back(req, "ok=1");
  }
  if (url) {
    if (!z.string().url().startsWith("https://").safeParse(url).success) return back(req, "e=url");
    await prisma.libraryItem.create({ data: { kind: "LINK", title, description, url, createdById: user.id } });
    return back(req, "ok=1");
  }
  return back(req, "e=empty");
}
