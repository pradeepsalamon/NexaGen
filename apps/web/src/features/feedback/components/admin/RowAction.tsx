"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";

const TONES = {
  danger: "border-app-danger/40 text-app-danger-ink hover:bg-app-danger",
  neutral: "border-app-border text-app-text hover:bg-primary",
  success: "border-success/40 text-success-ink hover:bg-success",
  warning: "border-warning/40 text-warning-ink hover:bg-warning"
} as const;

/** The house rounded-full icon action (AGENTS.md "UI Consistency Rule"). */
export function RowAction({
  disabled,
  icon: Icon,
  label,
  onClick,
  tone = "neutral"
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  tone?: keyof typeof TONES;
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        aria-label={label}
        className={`size-8 rounded-full p-0 transition-colors hover:text-white ${TONES[tone]}`}
        disabled={disabled}
        onClick={onClick}
        size="icon"
        type="button"
        variant="outline"
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </Button>
    </SimpleTooltip>
  );
}
