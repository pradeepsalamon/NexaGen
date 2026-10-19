import { createHash } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { aiServiceTokenClaims } from "@nexa-chess/types";
import { AiRuntimeTokenSigner, bodyHash } from "./ai-runtime.token";

const SECRET = "t".repeat(48);

const signer = () =>
  new AiRuntimeTokenSigner(new JwtService(), {
    enabled: true,
    secret: SECRET,
    timeoutMs: 5000,
    url: "http://ai-runtime:8000"
  });

const decodeHeader = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

describe("AiRuntimeTokenSigner", () => {
  it("mints exactly the §3.2 claims for an echo call", async () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const token = await signer().sign(
      { body, dataClass: "PUBLIC", rid: "req-12345678", scope: "runtime:diagnostic.echo", task: "diagnostic.echo.v1" },
      1_760_000_000
    );
    const claims = new JwtService().verify(token, { algorithms: ["HS256"], ignoreExpiration: true, secret: SECRET });

    expect(decodeHeader(token)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(Object.keys(claims).sort()).toEqual(
      ["aud", "bh", "dataClass", "exp", "iat", "iss", "jti", "rid", "scope", "task", "ver"].sort()
    );
    expect(claims).toMatchObject({
      aud: "ai-runtime",
      dataClass: "PUBLIC",
      exp: 1_760_000_030,
      iat: 1_760_000_000,
      iss: "nexa-api",
      rid: "req-12345678",
      scope: "runtime:diagnostic.echo",
      task: "diagnostic.echo.v1",
      ver: 1
    });
    expect(claims.exp - claims.iat).toBe(30);
    expect(claims.bh).toBe(createHash("sha256").update(body).digest("base64url"));
    expect(aiServiceTokenClaims.safeParse(claims).success).toBe(true);
  });

  it("omits task, dataClass and bh on an info call", async () => {
    const token = await signer().sign({ rid: "req-12345678", scope: "runtime:info" });
    const claims = new JwtService().verify(token, { algorithms: ["HS256"], secret: SECRET });
    expect(claims).not.toHaveProperty("task");
    expect(claims).not.toHaveProperty("dataClass");
    expect(claims).not.toHaveProperty("bh");
    expect(aiServiceTokenClaims.safeParse(claims).success).toBe(true);
  });

  it("uses a fresh jti every time", async () => {
    const s = signer();
    const a = s.buildClaims({ rid: "req-12345678", scope: "runtime:info" });
    const b = s.buildClaims({ rid: "req-12345678", scope: "runtime:info" });
    expect(a.jti).not.toBe(b.jti);
  });

  it("hashes bytes as unpadded base64url", () => {
    expect(bodyHash(Buffer.from(""))).toBe("47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU");
  });

  it("refuses to sign without a secret", async () => {
    const unconfigured = new AiRuntimeTokenSigner(new JwtService(), {
      enabled: false,
      secret: undefined,
      timeoutMs: 5000,
      url: "http://ai-runtime:8000"
    });
    await expect(unconfigured.sign({ rid: "req-12345678", scope: "runtime:info" })).rejects.toThrow();
  });
});
