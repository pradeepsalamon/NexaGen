import type { ReactNode } from "react";
import { toast } from "sonner";

/**
 * One place that decides what colour a live-class event toast is.
 *
 * The room fires a lot of small notices — joins, leaves, screen shares, board
 * grants, force-mutes, chat — and they are only readable at a glance if the
 * colour means the same thing every time. `<Toaster>` supplies the palette
 * (`richColors`), so all this does is pin each event to a severity:
 *
 * - `success` (green)  something became available to you: a person arrived,
 *                      you were granted control.
 * - `info`    (slate)  neutral room activity: someone left, a share started.
 * - `warning` (amber)  something was taken away or needs attention: control
 *                      revoked, the coach switched your mic off, a hand is up.
 * - `error`   (red)    reserved for genuine failures; meeting events never use it.
 */
export type MeetingToastTone = "success" | "info" | "warning";

export interface MeetingToastInput {
  tone: MeetingToastTone;
  title: string;
  description?: string;
  /** Stable id so a repeat of the same event replaces rather than stacks. */
  id?: string;
  durationMs?: number;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}

const DEFAULT_DURATION: Record<MeetingToastTone, number> = {
  success: 3000,
  info: 3500,
  warning: 6000,
};

export function meetingToast({
  action,
  description,
  durationMs,
  icon,
  id,
  title,
  tone,
}: MeetingToastInput) {
  const options = {
    action,
    description,
    duration: durationMs ?? DEFAULT_DURATION[tone],
    icon,
    ...(id ? { id } : {}),
  };

  if (tone === "success") toast.success(title, options);
  else if (tone === "warning") toast.warning(title, options);
  else toast.info(title, options);
}

/**
 * Collapse a burst of names into one line.
 *
 * Several people routinely join within a second of each other at the top of a
 * class; one toast per person buries the screen. Two names still read better
 * than a count, so only three or more collapse.
 */
export function summariseNames(names: string[], verb: string): { title: string; description?: string } {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length === 0) return { title: `Someone ${verb}` };
  if (unique.length === 1) return { title: `${unique[0]} ${verb}` };
  if (unique.length === 2) return { title: `${unique[0]} and ${unique[1]} ${verb}` };
  return {
    title: `${unique.length} people ${verb}`,
    description: unique.slice(0, 3).join(", ") + (unique.length > 3 ? ` and ${unique.length - 3} more` : ""),
  };
}
