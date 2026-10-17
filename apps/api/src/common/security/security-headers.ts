import type { NextFunction, Request, Response } from "express";

/**
 * The API's only HTML is the printable invoice: an inline <style>, nothing
 * else. Applied per route with `@Header("Content-Security-Policy", …)` — a
 * global CSP would also hit PDF and image responses, where Chrome's viewer
 * needs `object-src`.
 */
export const INVOICE_HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * Browser hardening for every API response. Nothing here embeds the API in a
 * frame (invoices and recordings open as top-level tabs), and no response
 * should ever leak its URL — stream and reset tokens ride in query strings.
 */
export function securityHeaders(request: Request, response: Response, next: NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  // `secure` honours X-Forwarded-Proto through the trusted proxy hop.
  if (request.secure) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  next();
}
