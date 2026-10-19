import { logAiCall } from "./ai-log";

describe("logAiCall", () => {
  it("logs successes at info and failures at warn, metadata only", () => {
    const logger = { log: jest.fn(), warn: jest.fn() };
    logAiCall(logger, { latencyMs: 3, outcome: "ok", path: "/v1/diagnostic/echo", rid: "req-12345678" });
    logAiCall(logger, {
      errorCode: "BUSY",
      latencyMs: 1,
      outcome: "busy",
      path: "/v1/diagnostic/echo",
      rid: "req-12345678"
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const keys = new Set([...logger.log.mock.calls, ...logger.warn.mock.calls].flatMap((call) => Object.keys(call[0])));
    const allowed = [
      "dataClass",
      "errorCode",
      "event",
      "httpStatus",
      "latencyMs",
      "model",
      "outcome",
      "path",
      "provider",
      "rid",
      "task"
    ];
    for (const key of keys) expect(allowed).toContain(key);
  });
});
