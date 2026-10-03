import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return "null";
  }
}

/**
 * CSRF defence for cookie auth: a state-changing request must come from an
 * allowed origin. A request with neither Origin nor Referer is not from a
 * browser form or fetch (browsers always send Origin on cross-origin POSTs),
 * so it is let through — cookies are what make CSRF possible, not the request.
 */
export function isAllowedRequestOrigin(
  request: { headers: Record<string, string | string[] | undefined>; method: string },
  allowedOrigins: ReadonlySet<string>
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const origin = header("origin");
  const source = originOf(origin ?? header("referer"));
  if (source === undefined) return true;
  return allowedOrigins.has(source);
}

export function createOriginCheckMiddleware(allowedOrigins: string[], exemptPaths: string[]) {
  const allowed = new Set(allowedOrigins.map((origin) => originOf(origin) ?? origin));
  return (request: Request, response: Response, next: NextFunction) => {
    if (exemptPaths.some((path) => request.path === path || request.path.startsWith(`${path}/`))) {
      return next();
    }
    if (isAllowedRequestOrigin(request, allowed)) return next();
    response.status(403).json({
      error: "Forbidden",
      message: "Request origin is not allowed.",
      statusCode: 403
    });
  };
}
