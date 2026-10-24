import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { PALETTE_COOKIE } from "@/lib/palette";

// Διακόπτης παλέτας της προεπισκόπησης (23/10): ?v=foto|brand&back=/m… — μένει σε όλες τις σελίδες του μέλους (cookie).
export async function GET(req: NextRequest) {
  await requireRole("MEMBER");
  const v = req.nextUrl.searchParams.get("v") === "foto" ? "foto" : "brand";
  const back = req.nextUrl.searchParams.get("back") ?? "/m";
  const res = NextResponse.redirect(new URL(back.startsWith("/m") && !back.startsWith("//") ? back : "/m", req.url));
  res.cookies.set(PALETTE_COOKIE, v, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return res;
}
