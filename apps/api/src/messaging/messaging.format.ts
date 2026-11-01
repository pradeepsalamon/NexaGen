/** Name used by `{{academy.name}}` in every template. */
export const ACADEMY_NAME = "Nexa Chess";

type Shape = "date" | "time" | "dateTime";

/**
 * Renders a timestamp for one recipient. This is the rare server-side format
 * the date rule allows — the zone is the recipient's own `User.timezone`, never
 * the server's (see AGENTS.md "Date & Time Rule").
 */
export function formatInZone(value: Date, timeZone: string, shape: Shape): string {
  const zone = safeZone(timeZone);

  const date = value.toLocaleDateString("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  const time = value
    .toLocaleTimeString("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })
    .toLowerCase();

  if (shape === "date") return date;
  if (shape === "time") return time;
  return `${date} at ${time}`;
}

/** A demo guest has no account and so no known timezone: UTC, and says so. */
export function formatDemoTime(startsAt: Date): string {
  return startsAt.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });
}

/** An unknown zone would throw inside a loop over recipients. */
function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** First letter and domain only, for the delivery log and test results. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at < 1 ? "•••" : `${email[0]}•••${email.slice(at)}`;
}

/** Delivery logs show the tail only — the log is not a phone book. */
export function maskPhoneNumber(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length <= 4 ? `••${phone}` : `••••${phone.slice(-4)}`;
}
