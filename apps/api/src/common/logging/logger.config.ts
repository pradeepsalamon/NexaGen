import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiEnv } from "@nexa-chess/config/api";
import type { Params } from "nestjs-pino";

const UNLOGGED_PREFIXES = ["/health", "/stockfish", "/presence/heartbeat"];
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Query strings can carry signed tokens (recording `st`), so they never reach the log. */
export function stripQuery(url: string | undefined): string {
  return (url ?? "").split("?")[0];
}

export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers["x-request-id"];
  const id =
    typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", id);
  return id;
}

export function buildLoggerParams(env: Pick<ApiEnv, "LOG_LEVEL" | "NODE_ENV">): Params {
  const production = env.NODE_ENV === "production";
  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? (production ? "info" : "debug"),
      genReqId: resolveRequestId,
      autoLogging: {
        ignore: (req) => UNLOGGED_PREFIXES.some((prefix) => stripQuery(req.url).startsWith(prefix))
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      serializers: {
        // `raw.ip` is Express' proxy-aware client IP; remoteAddress would be nginx.
        req: (req: { id: string; method: string; url: string; raw?: { ip?: string } }) => ({
          id: req.id,
          method: req.method,
          url: stripQuery(req.url),
          ip: req.raw?.ip
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
      },
      ...(production
        ? {}
        : { transport: { target: "pino-pretty", options: { singleLine: true } } })
    }
  };
}
