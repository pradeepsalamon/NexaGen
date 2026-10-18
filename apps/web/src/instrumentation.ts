import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, SENTRY_DSN } from "./lib/sentry";

export function register() {
  if (!SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(SENTRY_BASE_OPTIONS);
  }
}

export const onRequestError = Sentry.captureRequestError;
