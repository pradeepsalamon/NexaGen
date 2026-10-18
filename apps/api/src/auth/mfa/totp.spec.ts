import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  totpStep,
  verifyTotp
} from "./totp";
import {
  decryptSecret,
  deriveMfaKey,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode
} from "./mfa-crypto";

// RFC 6238 Appendix B, SHA1 seed "12345678901234567890" (last 6 of the 8-digit vectors).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"]
  ])("matches the RFC 6238 vector at t=%i", (seconds, code) => {
    expect(generateTotp(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
  });

  it("round-trips base32", () => {
    const bytes = Buffer.from("nexa chess totp");
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("accepts the adjacent step for clock drift and returns the matched step", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const previous = generateTotp(secret, totpStep(now) - 1);
    expect(verifyTotp(secret, previous, now)).toBe(totpStep(now) - 1);
  });

  it("rejects codes outside the window and malformed input", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, generateTotp(secret, totpStep(now) - 3), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });

  it("builds an otpauth URL authenticator apps accept", () => {
    const url = buildOtpauthUrl("ABC", "admin@nexa.test", "Nexa Chess");
    expect(url).toMatch(/^otpauth:\/\/totp\/Nexa%20Chess%3Aadmin%40nexa\.test\?/);
    expect(url).toContain("secret=ABC");
    expect(url).toContain("issuer=Nexa+Chess");
  });
});

describe("mfa crypto", () => {
  const key = deriveMfaKey("x".repeat(32));

  it("encrypts with a fresh IV and decrypts back", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", key);
    const b = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("refuses a tampered ciphertext or the wrong key", () => {
    const encrypted = encryptSecret("secret", key);
    const parts = encrypted.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(() => decryptSecret(encrypted, deriveMfaKey("y".repeat(32)))).toThrow();
  });

  it("hashes recovery codes independent of case and separators", () => {
    const [code] = generateRecoveryCodes(1);
    expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(hashRecoveryCode(code.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(code));
  });
});
