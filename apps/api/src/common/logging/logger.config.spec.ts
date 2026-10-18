import type { IncomingMessage, ServerResponse } from "node:http";
import { buildLoggerParams, resolveRequestId, stripQuery } from "./logger.config";

describe("logger config", () => {
  it("strips query strings, which can carry signed tokens", () => {
    expect(stripQuery("/live-class/1/recording/stream?st=secret")).toBe(
      "/live-class/1/recording/stream"
    );
    expect(stripQuery(undefined)).toBe("");
  });

  it("reuses a well-formed incoming request id and echoes it", () => {
    const setHeader = jest.fn();
    const id = resolveRequestId(
      { headers: { "x-request-id": "abc12345-req" } } as unknown as IncomingMessage,
      { setHeader } as unknown as ServerResponse
    );
    expect(id).toBe("abc12345-req");
    expect(setHeader).toHaveBeenCalledWith("x-request-id", "abc12345-req");
  });

  it("replaces a malformed request id", () => {
    const id = resolveRequestId(
      { headers: { "x-request-id": "<script>" } } as unknown as IncomingMessage,
      { setHeader: jest.fn() } as unknown as ServerResponse
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs info in production with no pretty transport", () => {
    const params = buildLoggerParams({ NODE_ENV: "production", LOG_LEVEL: undefined });
    const http = params.pinoHttp as { level: string; transport?: unknown };
    expect(http.level).toBe("info");
    expect(http.transport).toBeUndefined();
  });
});
