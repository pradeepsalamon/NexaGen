import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { HttpException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AiRuntimeClient } from "./ai-runtime.client";
import type { AiRuntimeConfig } from "./ai-runtime.config";
import { AiRuntimeTokenSigner } from "./ai-runtime.token";

// Test 1 (PHASE1_SPEC.md §8): the real client against a real runtime.
// Needs AI_RUNTIME_URL + AI_RUNTIME_SHARED_SECRET of a running Uvicorn, and
// AI_RUNTIME_TEST_LOG pointing at its stdout to check the runtime's log line.

const url = process.env.AI_RUNTIME_URL ?? "http://127.0.0.1:8000";
const secret = process.env.AI_RUNTIME_SHARED_SECRET;
if (!secret) throw new Error("AI_RUNTIME_SHARED_SECRET must be set for runtime specs.");

const config: AiRuntimeConfig = { enabled: true, secret, timeoutMs: 5000, url };
const client = (overrides: Partial<AiRuntimeConfig> = {}) => {
  const merged = { ...config, ...overrides };
  return new AiRuntimeClient(new AiRuntimeTokenSigner(new JwtService(), merged), merged);
};

const runtimeLogLines = (rid: string) =>
  process.env.AI_RUNTIME_TEST_LOG
    ? readFileSync(process.env.AI_RUNTIME_TEST_LOG, "utf8")
        .split("\n")
        .filter((line) => line.includes(`"rid": "${rid}"`))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : undefined;

const waitFor = async <T>(read: () => T | undefined, ms = 2000): Promise<T | undefined> => {
  const until = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined || Date.now() > until) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe("AiRuntimeClient ↔ ai-runtime", () => {
  let apiLines: Record<string, unknown>[];

  beforeEach(() => {
    apiLines = [];
    jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation((line: unknown) => void apiLines.push(line as Record<string, unknown>));
    jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation((line: unknown) => void apiLines.push(line as Record<string, unknown>));
  });

  afterEach(() => jest.restoreAllMocks());

  it("round-trips an echo with one log line per side sharing the rid", async () => {
    const rid = `rt-${randomUUID()}`;
    const text = `round trip ${randomUUID()}`;

    const result = await client().echo(rid, text);

    expect(result.output).toEqual({ echo: text, length: text.length });
    expect(result).toMatchObject({ contractVersion: "1.0", model: "echo", provider: "mock" });

    expect(apiLines).toHaveLength(1);
    expect(apiLines[0]).toMatchObject({ outcome: "ok", rid, task: "diagnostic.echo.v1" });
    expect(JSON.stringify(apiLines)).not.toContain(text);

    const lines = await waitFor(() => {
      const found = runtimeLogLines(rid);
      return found && found.length > 0 ? found : undefined;
    });
    if (process.env.AI_RUNTIME_TEST_LOG) {
      expect(lines).toHaveLength(1);
      expect(lines![0]).toMatchObject({ path: "/v1/diagnostic/echo", rid, status: 200, task: "diagnostic.echo.v1" });
      expect(readFileSync(process.env.AI_RUNTIME_TEST_LOG, "utf8")).not.toContain(text);
    }
  });

  it("reads readiness and info", async () => {
    const rid = `rt-${randomUUID()}`;
    await expect(client().readiness(rid)).resolves.toEqual({ providers: { mock: "ready" }, status: "ready" });
    await expect(client().info(rid)).resolves.toMatchObject({
      contractVersions: ["1.0"],
      providers: ["mock"],
      service: "ai-runtime",
      tasks: ["diagnostic.echo.v1"]
    });
  });

  it("maps a wrong secret to 502, never 401", async () => {
    const error = await client({ secret: "w".repeat(48) })
      .echo(`rt-${randomUUID()}`, "hi")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(502);
  });
});
