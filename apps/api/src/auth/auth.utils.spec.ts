import {
  createOpaqueToken,
  hashOpaqueToken,
  hashSecret,
  parseDurationMs,
  splitStudentName,
  verifySecret
} from "./auth.utils";

describe("auth.utils", () => {
  describe("hashSecret and verifySecret", () => {
    it("should hash a secret and verify it correctly", async () => {
      const secret = "super-secret-password-123";
      const hashed = await hashSecret(secret);

      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(secret);

      const isValid = await verifySecret(secret, hashed);
      expect(isValid).toBe(true);
    });

    it("should return false for invalid secret verification", async () => {
      const secret = "super-secret-password-123";
      const hashed = await hashSecret(secret);

      const isValid = await verifySecret("wrong-password", hashed);
      expect(isValid).toBe(false);
    });
  });

  describe("createOpaqueToken and hashOpaqueToken", () => {
    it("should create a base64url encoded opaque token", () => {
      const token = createOpaqueToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
      // base64url shouldn't have +, /, or = characters
      expect(token).not.toMatch(/[+/=]/);
    });

    it("should hash the opaque token using sha256 hex", () => {
      const token = "some-opaque-token-value";
      const hashed = hashOpaqueToken(token);
      
      expect(typeof hashed).toBe("string");
      expect(hashed.length).toBe(64); // sha256 hex length
      expect(hashed).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("parseDurationMs", () => {
    const fallback = 1000;

    it("should parse standard units correctly", () => {
      expect(parseDurationMs("500", fallback)).toBe(500);
      expect(parseDurationMs("500ms", fallback)).toBe(500);
      expect(parseDurationMs("5s", fallback)).toBe(5000);
      expect(parseDurationMs("2m", fallback)).toBe(120_000);
      expect(parseDurationMs("1h", fallback)).toBe(3_600_000);
      expect(parseDurationMs("1d", fallback)).toBe(86_400_000);
    });

    it("should return fallback for invalid formats", () => {
      expect(parseDurationMs("invalid", fallback)).toBe(fallback);
      expect(parseDurationMs("5x", fallback)).toBe(fallback);
      expect(parseDurationMs("", fallback)).toBe(fallback);
    });

    it("should trim whitespace", () => {
      expect(parseDurationMs("  10s  ", fallback)).toBe(10_000);
    });
  });

  describe("splitStudentName", () => {
    it("should handle single names", () => {
      expect(splitStudentName("Alice")).toEqual({
        firstName: "Alice",
        lastName: undefined
      });
    });

    it("should handle two names", () => {
      expect(splitStudentName("Alice Smith")).toEqual({
        firstName: "Alice",
        lastName: "Smith"
      });
    });

    it("should handle multiple names", () => {
      expect(splitStudentName("Alice Mary Smith")).toEqual({
        firstName: "Alice",
        lastName: "Mary Smith"
      });
    });

    it("should handle extra whitespace", () => {
      expect(splitStudentName("  Alice   Smith  ")).toEqual({
        firstName: "Alice",
        lastName: "Smith"
      });
    });
  });
});
