import type { Breadcrumb, ErrorEvent, NodeOptions } from "@sentry/nestjs";

/** The SDK collects bodies, cookies, locals and job args by default; none may leave. */
export const SENTRY_DATA_COLLECTION: NodeOptions["dataCollection"] = {
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
};

// Students are minors: nothing but the user id leaves the box.
const DROPPED_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-forwarded-for", "x-real-ip"]);

/** Query strings carry signed tokens (recording `st`, demo `invite`), so they go too. */
export function stripQuery(url: string): string {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { headers } = event.request;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (DROPPED_HEADERS.has(name.toLowerCase())) delete headers[name];
      }
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url = breadcrumb.data?.url;
  if (typeof url === "string") {
    breadcrumb.data = { ...breadcrumb.data, url: stripQuery(url) };
  }
  return breadcrumb;
}
