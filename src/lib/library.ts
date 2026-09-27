import "server-only";
import type { LibraryKind } from "@prisma/client";
import sharp from "sharp";

export const LIBRARY_MAX_BYTES = 40 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
export const PHOTOS_PER_ASSIGNMENT = 10;

export function kindFromMime(mime: string): LibraryKind | null {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  return null;
}

/** Φωτογραφία εργασίας: σωστός προσανατολισμός, έως 2000px, JPEG χωρίς EXIF (τοποθεσία, συσκευή). */
export async function cleanPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Απάντηση σε αίτημα Range (χρειάζεται για ήχο/βίντεο σε iPhone). */
export function rangeResponse(req: Request, body: Buffer, headers: Record<string, string>): Response {
  const total = body.length;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const base = { ...headers, "accept-ranges": "bytes", "cache-control": "private, no-store" };
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(new Uint8Array(body), { headers: { ...base, "content-length": String(total) } });
  }
  let start = m[1] === "" ? total - Number(m[2]) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? total - 1 : Number(m[2]);
  start = Math.max(0, start);
  end = Math.min(end, total - 1);
  if (start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${total}` } });
  return new Response(new Uint8Array(body.subarray(start, end + 1)), {
    status: 206,
    headers: { ...base, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
  });
}
