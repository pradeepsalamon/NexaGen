import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "@nexa-chess/types";
import { PaymentProviderError } from "./payment-provider.interface";

/** Anything a gateway can hand back. Narrowed by each adapter's mapper. */
export type JsonRecord = Record<string, unknown>;

export type ProviderResponse = {
  ok: boolean;
  status: number;
  body: JsonRecord;
  durationMs: number;
};

export type ProviderRequest = {
  url: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers: Record<string, string>;
  /** JSON body, or a form-encoded string for Stripe. */
  body?: string;
  timeoutMs: number;
};

/**
 * One network attempt. Never retries — a retry that is not idempotent is how
 * customers get charged twice, and the idempotency key belongs to the caller.
 *
 * A transport failure (DNS, timeout, reset) surfaces as status 0, which the
 * adapters treat as retryable: we do not know whether the gateway acted, so
 * reconciliation must decide rather than a blind re-POST.
 */
export async function providerFetch(
  request: ProviderRequest
): Promise<ProviderResponse> {
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs)
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: (error as Error).message },
      durationMs: Date.now() - startedAt
    };
  }

  const durationMs = Date.now() - startedAt;
  const text = await response.text().catch(() => "");

  let body: JsonRecord = {};
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      body =
        parsed && typeof parsed === "object"
          ? (parsed as JsonRecord)
          : { value: parsed };
    } catch {
      body = { raw: text };
    }
  }

  return { ok: response.ok, status: response.status, body, durationMs };
}

/** 5xx, 429 and transport failures may be retried; 4xx is our own mistake. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

export function providerError(
  provider: PaymentProvider,
  operation: string,
  response: ProviderResponse,
  fallbackMessage: string,
  code?: string | null
): PaymentProviderError {
  return new PaymentProviderError(
    provider,
    operation,
    extractErrorMessage(response.body) ?? fallbackMessage,
    {
      code: code ?? extractErrorCode(response.body),
      statusCode: response.status,
      retryable: isRetryableStatus(response.status)
    }
  );
}

/** Providers bury their message in different places; try each shape. */
function extractErrorMessage(body: JsonRecord): string | null {
  const error = body.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = error as JsonRecord;
    if (typeof nested.description === "string") return nested.description;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof body.message === "string") return body.message;
  if (typeof body.error_description === "string") return body.error_description;
  return null;
}

function extractErrorCode(body: JsonRecord): string | null {
  const error = body.error;
  if (error && typeof error === "object") {
    const nested = error as JsonRecord;
    if (typeof nested.code === "string") return nested.code;
    if (typeof nested.reason === "string") return nested.reason;
    if (typeof nested.type === "string") return nested.type;
  }
  if (typeof body.code === "string") return body.code;
  if (typeof body.type === "string") return body.type;
  return null;
}

/** Basic auth header for gateways that authenticate with key:secret. */
export function basicAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/**
 * Constant-time compare of two signatures. A plain `===` leaks the position of
 * the first differing byte, which is enough to forge a signature given enough
 * requests.
 */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function hmacBase64(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

/** Headers arrive as string | string[]; webhooks only ever need the first. */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Reads a nested path out of an untyped provider payload. */
export function pick(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as JsonRecord)[key];
  }
  return current;
}

export function pickString(source: unknown, ...path: string[]): string | null {
  const value = pick(source, ...path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function pickNumber(source: unknown, ...path: string[]): number | null {
  const value = pick(source, ...path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
