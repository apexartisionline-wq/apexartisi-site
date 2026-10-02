import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Κρυπτογράφηση πεδίων με AES-256-GCM. Το κλειδί (DATA_KEY, 32 bytes σε base64) φυλάσσεται
// εκτός βάσης. Χωρίς κλειδί (μόνο τοπικά) τα δεδομένα αποθηκεύονται όπως είναι.
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const k = process.env.DATA_KEY;
  if (!k) {
    if (process.env.NODE_ENV === "production") throw new Error("DATA_KEY λείπει");
    return null;
  }
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("Το DATA_KEY πρέπει να είναι 32 bytes σε base64");
  return b;
}

export function encryptBytes(plain: Buffer): Buffer {
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from("AEX1"), iv, c.getAuthTag(), data]);
}

export function decryptBytes(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).toString() !== "AEX1") return buf;
  const k = key();
  if (!k) throw new Error("Κρυπτογραφημένα δεδομένα χωρίς DATA_KEY");
  const iv = buf.subarray(4, 16);
  const tag = buf.subarray(16, 32);
  const d = createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(32)), d.final()]);
}

export function enc(text: string): string {
  if (!text || !key()) return text;
  return PREFIX + encryptBytes(Buffer.from(text, "utf8")).toString("base64");
}

export function dec(text: string | null | undefined): string {
  if (!text) return "";
  if (!text.startsWith(PREFIX)) return text; // παλιά, μη κρυπτογραφημένα
  return decryptBytes(Buffer.from(text.slice(PREFIX.length), "base64")).toString("utf8");
}
