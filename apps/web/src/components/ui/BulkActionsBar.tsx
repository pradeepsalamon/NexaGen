"use client";

import { X, type LucideIcon } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export type BulkAction = {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  /** Colours the action: danger = delete, success = publish/activate, warning = archive, info = move/email. */
  tone?: "danger" | "default" | "info" | "success" | "warning";
};

const TONE: Record<NonNullable<BulkAction["tone"]>, string> = {
  danger: "bg-app-danger-soft text-app-danger-ink hover:bg-app-danger hover:text-on-danger",
  default: "bg-app-soft text-app-text hover:bg-app-border",
  info: "bg-info-soft text-info-ink hover:bg-info hover:text-on-info",
  success: "bg-success-soft text-success-ink hover:bg-success hover:text-on-success",
  warning: "bg-warning-soft text-warning-ink hover:bg-warning hover:text-on-warning"
};

/** Floating bar shown while table rows are selected. Renders nothing at zero. */
export function BulkActionsBar({
  actions,
  count,
  noun = "item",
  onClear
}: {
  actions: BulkAction[];
  count: number;
  /** Singular noun for the count ("batch" → "3 batches selected"). */
  noun?: string;
  onClear: () => void;
}) {
  if (count === 0) return null;

  const plural =
    noun.endsWith("s") || noun.endsWith("ch")
      ? `${noun}es`
      : /[^aeiou]y$/.test(noun)
        ? `${noun.slice(0, -1)}ies`
        : `${noun}s`;

  return (
    <div
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] animate-slide-up items-center gap-1.5 rounded-app border border-app-border bg-app-surface p-1.5 text-app-text shadow-soft"
      role="toolbar"
    >
      <span aria-live="polite" className="mr-1 inline-flex min-h-[var(--control-h)] items-center gap-2 whitespace-nowrap rounded-control bg-primary px-3 text-sm font-semibold text-on-primary">
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-on-primary px-1.5 text-xs font-bold text-primary-ink">
          {count}
        </span>
        <span className="max-sm:sr-only">{count === 1 ? noun : plural} selected</span>
      </span>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            className={cn(
              "inline-flex min-h-[var(--control-h)] items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
              TONE[action.tone ?? "default"]
            )}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onSelect}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
            <span className="max-sm:sr-only">{action.label}</span>
          </button>
        );
      })}
      <SimpleTooltip label="Clear selection">
        <button
          aria-label="Clear selection"
          className="inline-flex size-[var(--control-h)] items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          onClick={onClear}
          type="button"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </button>
      </SimpleTooltip>
    </div>
  );
}
