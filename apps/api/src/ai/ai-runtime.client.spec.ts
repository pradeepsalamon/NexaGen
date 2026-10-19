import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AiRuntimeClient } from "./ai-runtime.client";
import type { AiRuntimeConfig } from "./ai-runtime.config";
import { AiRuntimeTokenSigner } from "./ai-runtime.token";

const SECRET = "c".repeat(48);
const RID = "req-12345678";
const SENTINEL = "SENTINEL-do-not-log-7f3a";

type Handler = (req: IncomingMessage, body: Buffer, res: ServerResponse) => void;

let server: Server;
let port: number;
let handler: Handler;

const echoOk = (text: string) => ({
  contractVersion: "1.0",
  latencyMs: 1,
  model: "echo",
  modelRevision: null,
  output: { echo: text, length: text.length },
  provider: "mock"
});

const envelope = (code: string) => ({ error: { code, message: "Nope.", retryable: false } });

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => handler(req, Buffer.concat(chunks), res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

let logs: unknown[][];

beforeEach(() => {
  logs = [];
  jest.spyOn(Logger.prototype, "log").mockImplementation((...args: unknown[]) => void logs.push(args));
  jest.spyOn(Logger.prototype, "warn").mockImplementation((...args: unknown[]) => void logs.push(args));
});

afterEach(() => jest.restoreAllMocks());

const client = (overrides: Partial<AiRuntimeConfig> = {}) => {
  const config: AiRuntimeConfig = {
    enabled: true,
    secret: SECRET,
    timeoutMs: 1000,
    url: `http://127.0.0.1:${port}`,
    ...overrides
  };
  return new AiRuntimeClient(new AiRuntimeTokenSigner(new JwtService(), config), config);
};

const statusOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  return 200;
};

describe("AiRuntimeClient", () => {
  it("sends a signed, body-bound request and returns the echo", async () => {
    let seen: { body: Buffer; req: IncomingMessage } | undefined;
    handler = (req, body, res) => {
      seen = { body, req };
      json(res, 200, echoOk(SENTINEL));
    };

    const result = await client().echo(RID, SENTINEL);

    expect(result.output.echo).toBe(SENTINEL);
    expect(seen!.req.method).toBe("POST");
    expect(seen!.req.url).toBe("/v1/diagnostic/echo");
    expect(seen!.req.headers["x-request-id"]).toBe(RID);
    expect(seen!.req.headers["x-contract-version"]).toBe("1.0");
    expect(seen!.req.headers["content-type"]).toBe("application/json");
    const token = String(seen!.req.headers.authorization).replace(/^Bearer /, "");
    const claims = new JwtService().verify(token, { algorithms: ["HS256"], secret: SECRET });
    expect(claims.bh).toBe(createHash("sha256").update(seen!.body).digest("base64url"));
    expect(claims.rid).toBe(RID);
    expect(JSON.parse(seen!.body.toString())).toEqual({
      dataClass: "PUBLIC",
      input: { text: SENTINEL },
      route: "mock:echo",
      task: "diagnostic.echo.v1"
    });
  });

  it("writes one metadata-only log line per call", async () => {
    handler = (_req, _body, res) => json(res, 200, echoOk(SENTINEL));
    await client().echo(RID, SENTINEL);

    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toMatchObject({
      dataClass: "PUBLIC",
      event: "ai.runtime.call",
      model: "echo",
      outcome: "ok",
      provider: "mock",
      rid: RID,
      task: "diagnostic.echo.v1"
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SECRET);
    expect(JSON.stringify(logs)).not.toContain("Bearer");
  });

  it.each([
    ["200 that breaks the contract", (res: ServerResponse) => json(res, 200, { echo: "x" }), 502],
    ["200 that is not JSON", (res: ServerResponse) => res.end("<html>"), 502],
    ["INVALID_REQUEST", (res: ServerResponse) => json(res, 400, envelope("INVALID_REQUEST")), 502],
    ["UNAUTHORIZED", (res: ServerResponse) => json(res, 401, envelope("UNAUTHORIZED")), 502],
    ["POLICY_DENIED", (res: ServerResponse) => json(res, 403, envelope("POLICY_DENIED")), 502],
    ["PAYLOAD_TOO_LARGE", (res: ServerResponse) => json(res, 413, envelope("PAYLOAD_TOO_LARGE")), 502],
    ["UNSUPPORTED_MEDIA", (res: ServerResponse) => json(res, 415, envelope("UNSUPPORTED_MEDIA")), 502],
    ["a bare 404", (res: ServerResponse) => res.writeHead(404).end("not found"), 502],
    ["BUSY", (res: ServerResponse) => json(res, 429, envelope("BUSY")), 429],
    ["TIMEOUT", (res: ServerResponse) => json(res, 504, envelope("TIMEOUT")), 504],
    ["PROVIDER_UNAVAILABLE", (res: ServerResponse) => json(res, 503, envelope("PROVIDER_UNAVAILABLE")), 503],
    ["INTERNAL", (res: ServerResponse) => json(res, 500, envelope("INTERNAL")), 503],
    ["a non-envelope 503 (uvicorn limit)", (res: ServerResponse) => res.writeHead(503).end("Service Unavailable"), 503]
  ])("maps a runtime %s to %d", async (_label, respond, expected) => {
    handler = (_req, _body, res) => respond(res);
    expect(await statusOf(client().echo(RID, "hi"))).toBe(expected);
  });

  it("never surfaces 401 or 403 to the caller", async () => {
    for (const [status, code] of [
      [401, "UNAUTHORIZED"],
      [403, "POLICY_DENIED"]
    ] as const) {
      handler = (_req, _body, res) => json(res, status, envelope(code));
      const result = await statusOf(client().echo(RID, "hi"));
      expect([401, 403]).not.toContain(result);
    }
  });

  it("discards a response over 64 KiB, declared or streamed", async () => {
    const big = JSON.stringify({ ...echoOk("x"), pad: "p".repeat(70 * 1024) });
    handler = (_req, _body, res) => {
      res.writeHead(200, { "Content-Length": Buffer.byteLength(big), "Content-Type": "application/json" });
      res.end(big);
    };
    expect(await statusOf(client().echo(RID, "hi"))).toBe(502);

    handler = (_req, _body, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      for (let i = 0; i < big.length; i += 8192) res.write(big.slice(i, i + 8192));
      res.end();
    };
    expect(await statusOf(client().echo(RID, "hi"))).toBe(502);
  });

  it("aborts at AI_RUNTIME_TIMEOUT_MS and answers 504", async () => {
    handler = () => undefined; // never responds
    const started = Date.now();
    expect(await statusOf(client({ timeoutMs: 300 }).echo(RID, "hi"))).toBe(504);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("answers 503 when nothing listens", async () => {
    expect(await statusOf(client({ url: "http://127.0.0.1:1" }).echo(RID, "hi"))).toBe(503);
    expect(JSON.stringify(logs)).not.toContain("127.0.0.1:1");
  });

  it("logs failures without the response body", async () => {
    handler = (_req, _body, res) =>
      json(res, 400, { error: { code: "INVALID_REQUEST", message: SENTINEL, retryable: false } });
    await statusOf(client().echo(RID, SENTINEL));
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toMatchObject({ errorCode: "INVALID_REQUEST", httpStatus: 400, outcome: "rejected" });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it("calls /readyz and /v1/info with the info scope and no body", async () => {
    const seen: { auth: string; method?: string; url?: string }[] = [];
    handler = (req, _body, res) => {
      seen.push({ auth: String(req.headers.authorization), method: req.method, url: req.url });
      if (req.url === "/readyz") json(res, 200, { providers: { mock: "ready" }, status: "ready" });
      else
        json(res, 200, {
          contractVersions: ["1.0"],
          providers: ["mock"],
          service: "ai-runtime",
          tasks: ["diagnostic.echo.v1"],
          version: "0.1.0"
        });
    };
    const c = client();
    await c.readiness(RID);
    await c.info(RID);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(["GET /readyz", "GET /v1/info"]);
    for (const s of seen) {
      const claims = new JwtService().verify(s.auth.replace(/^Bearer /, ""), { algorithms: ["HS256"], secret: SECRET });
      expect(claims.scope).toBe("runtime:info");
      expect(claims).not.toHaveProperty("bh");
    }
  });
});
