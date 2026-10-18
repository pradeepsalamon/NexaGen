// Loaded first by main.ts: Sentry must patch http/express before they are imported.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import * as Sentry from "@sentry/nestjs";
import {
  SENTRY_DATA_COLLECTION,
  scrubSentryBreadcrumb,
  scrubSentryEvent
} from "./common/sentry/sentry-scrub";

// apps/api/.env is otherwise only loaded by Prisma, after this file has run.
function readEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env")) return undefined;
  return parseEnv(readFileSync(".env", "utf8"))[name] || undefined;
}

const dsn = readEnv("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSend: scrubSentryEvent,
    dataCollection: SENTRY_DATA_COLLECTION,
    dsn,
    environment: readEnv("SENTRY_ENVIRONMENT") ?? readEnv("NODE_ENV") ?? "development",
    release: readEnv("SENTRY_RELEASE")
  });
}
