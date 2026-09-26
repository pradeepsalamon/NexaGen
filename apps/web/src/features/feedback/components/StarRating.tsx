"use client";

import { Star } from "lucide-react";
import { FEEDBACK_RATING_MAX } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"] as const;

const STARS = Array.from({ length: FEEDBACK_RATING_MAX }, (_, i) => i + 1);

/** Interactive 1-5 star picker (a radio group of star buttons). */
export function StarRatingInput({
  label,
  onChange,
  value
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div aria-label={label} className="flex items-center gap-1" role="radiogroup">
      {STARS.map((star) => {
        const active = value !== null && star <= value;
        const word = RATING_WORDS[star - 1];
        return (
          <SimpleTooltip key={star} label={word}>
            <button
              aria-checked={value === star}
              aria-label={`${star} of ${FEEDBACK_RATING_MAX} — ${word}`}
              className="rounded-full p-1 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
              onClick={() => onChange(star)}
              role="radio"
              type="button"
            >
              <Star
                aria-hidden="true"
                className={cn(
                  "size-7 transition-colors",
                  active ? "fill-warning text-warning" : "text-app-border"
                )}
                strokeWidth={2}
              />
            </button>
          </SimpleTooltip>
        );
      })}
      {value !== null ? (
        <span className="ml-2 text-sm font-semibold text-app-muted">{RATING_WORDS[value - 1]}</span>
      ) : null}
    </div>
  );
}

/** Read-only stars for an average (rounded to the nearest half is overkill here; full stars). */
export function StarRatingDisplay({
  className,
  size = "sm",
  value
}: {
  value: number | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const rounded = value === null ? 0 : Math.round(value);
  return (
    <span
      aria-label={value === null ? "No rating yet" : `${value} out of ${FEEDBACK_RATING_MAX}`}
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
    >
      {STARS.map((star) => (
        <Star
          aria-hidden="true"
          className={cn(
            size === "md" ? "size-5" : "size-3.5",
            star <= rounded ? "fill-warning text-warning" : "text-app-border"
          )}
          key={star}
          strokeWidth={2}
        />
      ))}
    </span>
  );
}
