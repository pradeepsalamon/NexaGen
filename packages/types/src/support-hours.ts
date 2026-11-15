import { z } from "zod";

// When an academy's team answers WhatsApp (docs/WHATSAPP_SUPPORT_MODES_PLAN.md
// D12). Pure, so the settings page can preview it and the API decides with the
// same rule: outside these hours a hand-off gets the academy's own
// out-of-hours message and staff reminders wait for opening time.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const supportHoursDaySchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday. */
    day: z.number().int().min(0).max(6),
    open: z.string().regex(TIME, "A time like 09:00"),
    close: z.string().regex(TIME, "A time like 18:00")
  })
  .refine((value) => value.open < value.close, { message: "Closing time must be after opening time", path: ["close"] });
export type SupportHoursDay = z.infer<typeof supportHoursDaySchema>;

export const supportHoursSchema = z.object({
  /** IANA zone the times are in, e.g. Asia/Kolkata. */
  timezone: z.string().trim().min(1).max(64),
  /** At most one window per weekday; a day that isn't listed is closed. */
  days: z
    .array(supportHoursDaySchema)
    .max(7)
    .refine((days) => new Set(days.map((day) => day.day)).size === days.length, "Each day at most once")
});
export type SupportHours = z.infer<typeof supportHoursSchema>;

export const SUPPORT_OUT_OF_HOURS_MAX = 500;

/** Sent after the hand-off message outside hours when the academy wrote none. Says nothing about when. */
export const DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE = "Our team is away right now. We'll reply as soon as we're back.";

export const SUPPORT_WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Whether a time zone name is one this runtime knows. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Weekday (0 = Sunday) and "HH:MM" of an instant in a time zone. */
export function supportLocalClock(now: Date, timeZone: string): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short"
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day, time: `${hour}:${get("minute")}` };
}

/**
 * Whether the team is in now. `null` hours = always open (24/7). An unknown
 * time zone counts as open, so a typo never silences reminders.
 */
export function supportHoursOpen(hours: SupportHours | null, now: Date): boolean {
  if (!hours) return true;
  if (!isKnownTimeZone(hours.timezone)) return true;
  const clock = supportLocalClock(now, hours.timezone);
  const today = hours.days.find((day) => day.day === clock.day);
  return Boolean(today && clock.time >= today.open && clock.time < today.close);
}
