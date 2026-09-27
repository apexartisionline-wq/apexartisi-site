import { beforeAll, describe, expect, it } from "vitest";

describe("field encryption", () => {
  beforeAll(() => {
    process.env.DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  it("encrypts and decrypts text and bytes", async () => {
    const { enc, dec, encryptBytes, decryptBytes } = await import("./crypto");
    const e = enc("Δουλέψαμε τη λαχτάρα");
    expect(e.startsWith("enc:v1:")).toBe(true);
    expect(e).not.toContain("λαχτάρα");
    expect(dec(e)).toBe("Δουλέψαμε τη λαχτάρα");
    expect(enc("a")).not.toBe(enc("a")); // τυχαίο IV
    expect(dec("παλιό κείμενο")).toBe("παλιό κείμενο");
    expect(decryptBytes(encryptBytes(Buffer.from("abc"))).toString()).toBe("abc");
  });
  it("rejects tampered data", async () => {
    const { enc, dec } = await import("./crypto");
    const e = enc("μυστικό");
    const bad = e.slice(0, -4) + (e.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => dec(bad)).toThrow();
  });
});
