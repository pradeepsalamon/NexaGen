import type * as Sentry from "@sentry/nextjs";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
export const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV;

// Browser noise that is never actionable.
export const SENTRY_IGNORE_ERRORS = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications"
];

/** Query strings carry signed tokens (recording `st`, demo `invite`). */
function stripQuery(url: string): string {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

// Students are minors: nothing but the user id leaves the browser or server.
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  const scrubbed = { ...data };
  for (const key of ["url", "from", "to"]) {
    if (typeof scrubbed[key] === "string") scrubbed[key] = stripQuery(scrubbed[key]);
  }
  breadcrumb.data = scrubbed;
  return breadcrumb;
}

export const SENTRY_BASE_OPTIONS = {
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSend: scrubSentryEvent,
  // The SDK collects bodies, cookies, locals and query params by default.
  dataCollection: {
    cookies: false,
    databaseQueryData: false,
    frameContextLines: 5,
    genAI: { inputs: false, outputs: false },
    httpBodies: [],
    httpHeaders: { allow: ["content-type", "user-agent"] },
    queues: false,
    stackFrameVariables: false,
    urlQueryParams: false,
    userInfo: false
  },
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  ignoreErrors: SENTRY_IGNORE_ERRORS
} satisfies Sentry.BrowserOptions;
