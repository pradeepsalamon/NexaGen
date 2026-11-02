"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";

const TONES = {
  danger: "text-app-danger-ink hover:bg-app-danger-soft",
  neutral: "",
  success: "text-success-ink hover:bg-success-soft",
  warning: "text-warning-ink hover:bg-warning-soft"
} as const;

/** The neutral table row action; only the icon carries the tone. */
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
        className={`size-8 ${TONES[tone]}`}
        disabled={disabled}
        onClick={onClick}
        size="icon"
        type="button"
        variant="neutral"
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </Button>
    </SimpleTooltip>
  );
}
