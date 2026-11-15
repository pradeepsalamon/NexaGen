import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusChipTone = "live" | "recording" | "success" | "warning" | "info" | "neutral";

const TONES: Record<StatusChipTone, { chip: string; dot: string }> = {
  // Red dot only for Live and Recording (spec: status chip rules).
  live: { chip: "bg-app-danger-soft text-app-danger-ink", dot: "bg-app-danger" },
  recording: { chip: "bg-app-soft text-app-text", dot: "bg-app-danger" },
  success: { chip: "bg-success-soft text-success-ink", dot: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
  info: { chip: "bg-info-soft text-info-ink", dot: "bg-info" },
  neutral: { chip: "bg-app-soft text-app-muted", dot: "bg-app-muted" },
};

/**
 * Status chip (spec component 2): 28px, full radius, a dot or an icon plus
 * 12px text. Inside the navy top bar (`surface-brand`) the tones read the
 * dark palette in both themes. The label is always a word, never colour alone.
 */
export function StatusChip({
  tone,
  icon,
  children,
  hideLabelBelowSm = false,
  pulse = false,
  className,
  ...props
}: {
  tone: StatusChipTone;
  /** Replaces the dot. */
  icon?: ReactNode;
  children: ReactNode;
  /** Phones: dot or icon only; the label stays for screen readers. */
  hideLabelBelowSm?: boolean;
  /** Only for a state that is changing right now (reconnecting); off under reduced motion. */
  pulse?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const tones = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular-nums",
        hideLabelBelowSm && "px-2 sm:px-2.5",
        tones.chip,
        className,
      )}
      {...props}
    >
      {icon ?? (
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", tones.dot, pulse && "motion-safe:animate-pulse")}
        />
      )}
      <span className={cn(hideLabelBelowSm && "sr-only sm:not-sr-only")}>{children}</span>
    </span>
  );
}
