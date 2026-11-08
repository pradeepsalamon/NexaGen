import type { LucideIcon } from "lucide-react";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

type StatTileProps = {
  /** Small contextual note in the top-right ("This Month", "Total"). */
  context?: string;
  icon: LucideIcon;
  label: string;
  /** 0–100; renders a ring around the icon instead of a flat chip */
  progress?: number;
  tone: Tone;
  /** Movement badge in the top-right, tinted in the tile's hue ("+4%"). */
  trend?: string;
  value: string;
};

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StatTile({
  context,
  icon: Icon,
  label,
  progress,
  tone,
  trend,
  value
}: StatTileProps) {
  const style = TONE[tone];
  const hasRing = typeof progress === "number" && Number.isFinite(progress);

  return (
    <article className="min-w-0 rounded-app border border-app-border bg-app-surface p-3 shadow-card sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
        {hasRing ? (
          <span aria-hidden="true" className="relative flex size-9 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
              <circle
                className="text-app-border"
                cx="24"
                cy="24"
                fill="none"
                r={RADIUS}
                stroke="currentColor"
                strokeWidth="5"
              />
              <circle
                className={style.text}
                cx="24"
                cy="24"
                fill="none"
                r={RADIUS}
                stroke="currentColor"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(Math.max(progress, 0), 100) / 100)}
                strokeLinecap="round"
                strokeWidth="5"
                style={{ transition: "stroke-dashoffset 900ms ease-out" }}
              />
            </svg>
            <Icon className={cn("size-4", style.text)} strokeWidth={2.5} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 items-center justify-center rounded-control",
              style.chip
            )}
          >
            <Icon className="size-4" strokeWidth={2.5} />
          </span>
        )}

        {trend ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              style.chip
            )}
          >
            {trend}
          </span>
        ) : context ? (
          <span className="min-w-0 truncate text-xs font-medium text-app-muted">{context}</span>
        ) : null}
      </div>

      <p className="font-display text-xl font-bold tracking-tight tabular-nums text-app-text sm:text-[2rem] sm:leading-10">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-app-muted">{label}</p>
    </article>
  );
}
