import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  AI_CONTRACT_VERSION,
  aiErrorEnvelope,
  aiRuntimeInfo,
  aiRuntimeReadiness,
  diagnosticEchoResponse,
  type AiDataClass,
  type AiErrorCode,
  type AiRuntimeInfo,
  type AiRuntimeReadiness,
  type AiServiceScope,
  type AiTaskId,
  type DiagnosticEchoRequest,
  type DiagnosticEchoResponse
} from "@nexa-chess/types";
import type { z } from "zod";
import { logAiCall, type AiCallLogLine, type AiCallOutcome } from "./ai-log";
import { AI_RUNTIME_CONFIG, type AiRuntimeConfig } from "./ai-runtime.config";
import { AiRuntimeTokenSigner } from "./ai-runtime.token";

/** A larger runtime response is discarded (PHASE1_SPEC.md §5.1). */
export const AI_RUNTIME_MAX_RESPONSE_BYTES = 64 * 1024;

type RuntimePath = AiCallLogLine["path"];

interface CallSpec<T> {
  body?: DiagnosticEchoRequest;
  dataClass?: AiDataClass;
  method: "GET" | "POST";
  path: RuntimePath;
  rid: string;
  schema: z.ZodType<T>;
  scope: AiServiceScope;
  task?: AiTaskId;
  timeoutMs?: number;
}

class ResponseTooLargeError extends Error {}

// Runtime 4xx means our request or token was wrong (a config or contract bug),
// so it is a 502 here — never a 401/403, which the web client would read as an
// expired session and spend a refresh rotation on.
const REJECTED_CODES = new Set<AiErrorCode>([
  "INVALID_REQUEST",
  "OUTPUT_SCHEMA_VIOLATION",
  "PAYLOAD_TOO_LARGE",
  "POLICY_DENIED",
  "UNAUTHORIZED",
  "UNSUPPORTED_MEDIA"
]);

/**
 * The only way the API talks to the AI runtime. `fetch` rather than axios
 * because axios errors carry the request headers (the token) into whatever
 * logs them. No retries: a diagnostic shows the raw outcome.
 */
@Injectable()
export class AiRuntimeClient {
  private readonly logger = new Logger("AiRuntime");

  constructor(
    private readonly signer: AiRuntimeTokenSigner,
    @Inject(AI_RUNTIME_CONFIG) private readonly config: AiRuntimeConfig
  ) {}

  echo(rid: string, text: string): Promise<DiagnosticEchoResponse> {
    return this.call({
      body: { dataClass: "PUBLIC", input: { text }, route: "mock:echo", task: "diagnostic.echo.v1" },
      dataClass: "PUBLIC",
      method: "POST",
      path: "/v1/diagnostic/echo",
      rid,
      schema: diagnosticEchoResponse,
      scope: "runtime:diagnostic.echo",
      task: "diagnostic.echo.v1"
    });
  }

  info(rid: string, timeoutMs?: number): Promise<AiRuntimeInfo> {
    return this.call({ method: "GET", path: "/v1/info", rid, schema: aiRuntimeInfo, scope: "runtime:info", timeoutMs });
  }

  readiness(rid: string, timeoutMs?: number): Promise<AiRuntimeReadiness> {
    return this.call({
      method: "GET",
      path: "/readyz",
      rid,
      schema: aiRuntimeReadiness,
      scope: "runtime:info",
      timeoutMs
    });
  }

  private async call<T>(spec: CallSpec<T>): Promise<T> {
    const started = Date.now();
    const line: AiCallLogLine = {
      dataClass: spec.dataClass,
      latencyMs: 0,
      outcome: "unavailable",
      path: spec.path,
      rid: spec.rid,
      task: spec.task
    };
    try {
      const result = await this.send(spec, line);
      line.outcome = "ok";
      return result;
    } finally {
      line.latencyMs = Date.now() - started;
      logAiCall(this.logger, line);
    }
  }

  private async send<T>(spec: CallSpec<T>, line: AiCallLogLine): Promise<T> {
    const body = spec.body ? Buffer.from(JSON.stringify(spec.body), "utf8") : undefined;
    const token = await this.signer.sign({
      body,
      dataClass: spec.dataClass,
      rid: spec.rid,
      scope: spec.scope,
      task: spec.task
    });

    let status: number;
    let text: string;
    try {
      const response = await fetch(`${this.config.url}${spec.path}`, {
        body,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Contract-Version": AI_CONTRACT_VERSION,
          "X-Request-Id": spec.rid,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        method: spec.method,
        redirect: "error",
        signal: AbortSignal.timeout(spec.timeoutMs ?? this.config.timeoutMs)
      });
      status = response.status;
      line.httpStatus = status;
      text = await readCapped(response, AI_RUNTIME_MAX_RESPONSE_BYTES);
    } catch (error) {
      throw this.transportError(error, line);
    }

    if (status === HttpStatus.OK) {
      const parsed = spec.schema.safeParse(parseJson(text));
      if (!parsed.success) throw fail(line, "invalid_response", new BadGatewayException("AI runtime returned an invalid response."));
      const data = parsed.data as { model?: unknown; provider?: unknown };
      if (typeof data.provider === "string") line.provider = data.provider;
      if (typeof data.model === "string") line.model = data.model;
      return parsed.data;
    }
    throw this.statusError(status, text, line);
  }

  private statusError(status: number, text: string, line: AiCallLogLine): HttpException {
    const envelope = aiErrorEnvelope.safeParse(parseJson(text));
    if (!envelope.success) {
      // Uvicorn's own over-limit answer and proxies' 5xx pages land here.
      return status >= 500
        ? fail(line, "unavailable", new ServiceUnavailableException("AI runtime is unavailable."))
        : fail(line, "rejected", new BadGatewayException("AI runtime rejected the request."));
    }
    const code = envelope.data.error.code;
    line.errorCode = code;
    if (REJECTED_CODES.has(code)) {
      return fail(line, "rejected", new BadGatewayException("AI runtime rejected the request."));
    }
    if (code === "BUSY") {
      return fail(line, "busy", new HttpException("AI runtime is busy. Try again shortly.", HttpStatus.TOO_MANY_REQUESTS));
    }
    if (code === "TIMEOUT" || code === "CANCELLED") {
      return fail(line, "timeout", new GatewayTimeoutException("AI runtime timed out."));
    }
    return fail(line, "unavailable", new ServiceUnavailableException("AI runtime is unavailable."));
  }

  private transportError(error: unknown, line: AiCallLogLine): HttpException {
    if (error instanceof ResponseTooLargeError) {
      return fail(line, "invalid_response", new BadGatewayException("AI runtime returned an invalid response."));
    }
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return fail(line, "timeout", new GatewayTimeoutException("AI runtime timed out."));
    }
    // Connection refused, DNS failure, reset: the error text names the URL, so it isn't logged.
    return fail(line, "unavailable", new ServiceUnavailableException("AI runtime is unavailable."));
  }
}

function fail(line: AiCallLogLine, outcome: AiCallOutcome, error: HttpException): HttpException {
  line.outcome = outcome;
  return error;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
