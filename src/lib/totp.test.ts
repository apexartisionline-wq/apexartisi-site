import { beforeAll, expect, it } from "vitest";
beforeAll(() => { process.env.DATA_KEY = Buffer.alloc(32, 7).toString("base64"); });
it("verifies a generated TOTP code", async () => {
  const { newSecret, verifyTotp } = await import("./totp");
  const { authenticator } = await import("otplib");
  const { stored, plain } = newSecret();
  expect(verifyTotp(stored, authenticator.generate(plain))).toBe(true);
  expect(verifyTotp(stored, "000000")).toBe(false);
});
