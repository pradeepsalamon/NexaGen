import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, SENTRY_DSN } from "./lib/sentry";

if (SENTRY_DSN) {
  Sentry.init(SENTRY_BASE_OPTIONS);
}
