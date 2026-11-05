import type { NextFunction, Request, Response } from "express";
import { runWithTenantContext } from "./tenant-context";
import type { TenantResolverService } from "./tenant-resolver.service";

/**
 * Runs the rest of the request inside its TenantContext. Registered in
 * `configureApp` **after** the body parsers: a parser resumes the chain from a
 * stream event, which would run outside the async context.
 */
export function createTenantContextMiddleware(
  resolver: TenantResolverService,
  webhookPaths: readonly string[]
) {
  // A path or anything below it (`/payments/webhooks/razorpay/<academy key>`).
  const isWebhook = (path: string) => webhookPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return (request: Request, _response: Response, next: NextFunction) => {
    resolver.resolveRequest(request).then(
      (store) =>
        runWithTenantContext(
          { ...store, origin: isWebhook(request.path) ? "webhook" : "request" },
          () => next()
        ),
      (error: unknown) => next(error)
    );
  };
}
