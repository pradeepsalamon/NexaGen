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
    <article className="rounded-[20px] border border-app-border bg-app-surface p-5 shadow-card transition-colors duration-200 hover:border-primary">
      <div className="mb-3 flex items-center justify-between gap-2">
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
              "flex size-10 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
              style.chip,
              style.border
            )}
          >
            <Icon className="size-4" strokeWidth={2.5} />
          </span>
        )}

        {trend ? (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-xs font-bold",
              style.chip
            )}
          >
            {trend}
          </span>
        ) : context ? (
          <span className="shrink-0 text-xs font-medium text-app-muted">{context}</span>
        ) : null}
      </div>

      <p className="font-mono text-2xl font-bold text-app-text sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-app-muted">{label}</p>
    </article>
  );
}
