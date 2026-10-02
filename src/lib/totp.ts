import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { dec, enc } from "./crypto";

authenticator.options = { window: 1 };

export function newSecret(): { stored: string; plain: string } {
  const plain = authenticator.generateSecret();
  return { stored: enc(plain), plain };
}

export function verifyTotp(stored: string | null, token: string): boolean {
  if (!stored || !/^\d{6}$/.test(token.trim())) return false;
  return authenticator.check(token.trim(), dec(stored));
}

export async function qrFor(stored: string, username: string, issuer: string): Promise<{ dataUrl: string; plain: string }> {
  const plain = dec(stored);
  const uri = authenticator.keyuri(username, issuer, plain);
  return { dataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), plain };
}
