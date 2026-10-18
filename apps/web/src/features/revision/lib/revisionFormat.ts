import { formatRelativeDay, formatTime } from "@/lib/datetime";

/**
 * "in 10 min" / "today at 18:40" / "tomorrow" / "Friday" / "5 Mar" — for a
 * due time the server already calculated. Never used to guess one.
 */
export function formatNextDue(iso: string, timeZone: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 60_000) return "now";
  if (ms < 60 * 60_000) return `in ${Math.round(ms / 60_000)} min`;
  const day = formatRelativeDay(iso, timeZone);
  if (day === "Today") return `today at ${formatTime(iso, timeZone)}`;
  if (day === "Tomorrow") return "tomorrow";
  return `on ${day}`;
}

/** "7 days", "1 day", or null for a same-day retry. */
export function formatInterval(days: number): string | null {
  if (days <= 0) return null;
  return days === 1 ? "1 day" : `${days} days`;
}
