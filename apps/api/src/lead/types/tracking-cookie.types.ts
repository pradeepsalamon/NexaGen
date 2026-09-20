export const TRACKING_COOKIE_NAMES = {
  visitorId: "nexa_visitor_id",
  sessionId: "nexa_session_id"
} as const;

export const TRACKING_COOKIE_PATH = "/";

/** 1 year, matching the original site's visitor cookie lifetime. */
export const VISITOR_ID_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
