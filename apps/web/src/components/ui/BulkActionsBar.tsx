"use client";

import { X, type LucideIcon } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export type BulkAction = {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  tone?: "danger" | "default";
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

  const plural = noun.endsWith("s") || noun.endsWith("ch") ? `${noun}es` : `${noun}s`;

  return (
    <div
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] animate-slide-up items-center gap-1.5 rounded-app bg-primary p-1.5 pl-4 text-on-primary shadow-lift"
      role="toolbar"
    >
      <span aria-live="polite" className="mr-1 whitespace-nowrap text-sm font-semibold">
        {count} {count === 1 ? noun : plural} selected
      </span>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            className={cn(
              "inline-flex min-h-[var(--control-h)] items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              action.tone === "danger"
                ? "bg-app-danger text-white hover:bg-app-danger-hover"
                : "bg-white/15 hover:bg-white/25"
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
          className="inline-flex size-[var(--control-h)] items-center justify-center rounded-control text-on-primary/80 transition-colors hover:bg-white/15 hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={onClear}
          type="button"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </button>
      </SimpleTooltip>
    </div>
  );
}
