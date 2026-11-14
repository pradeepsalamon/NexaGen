"use client";

import { Funnel, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export type ActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

/**
 * A funnel "Filters" button whose popover edits a local draft: nothing reaches
 * the caller (or its query) until Apply. Closing without Apply discards the
 * draft; Clear applies `emptyValue`. Pair with `FilterChips` for the active set.
 */
export function FilterPopover<T extends object>({
  activeCount,
  children,
  className,
  emptyValue,
  onApply,
  value
}: {
  activeCount: number;
  children: (draft: T, update: (patch: Partial<T>) => void) => ReactNode;
  className?: string;
  emptyValue: T;
  onApply: (value: T) => void;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T>(value);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const apply = (next: T) => {
    onApply(next);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={
            activeCount ? `Filters (${activeCount} active)` : "Filters"
          }
          variant="outline"
        >
          <Funnel className="size-4" strokeWidth={2.5} />
          Filters
          {activeCount ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn("w-[min(19rem,calc(100vw-2rem))] p-0", className)}
      >
        <div className="max-h-[65dvh] space-y-3 overflow-y-auto overflow-x-hidden p-3 [&_.grid]:gap-3 [&_button]:min-h-9 [&_button]:px-3 [&_button]:text-[0.8125rem] [&_input]:min-h-9 [&_input]:px-3 [&_input]:text-[0.8125rem] [&_select]:min-h-9 [&_select]:pl-3 [&_select]:pr-8 [&_select]:text-[0.8125rem]">
          {children(draft, (patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-app-border px-3 py-2">
          <Button
            className="min-h-8"
            onClick={() => apply(emptyValue)}
            size="sm"
            type="button"
            variant="outline"
          >
            Clear
          </Button>
          <Button
            className="min-h-8"
            onClick={() => apply(draft)}
            size="sm"
            type="button"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterField({
  children,
  htmlFor,
  label
}: {
  children: ReactNode;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-app-muted" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function FilterChips({
  filters,
  onClearAll
}: {
  filters: ActiveFilter[];
  onClearAll?: () => void;
}) {
  if (!filters.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-soft py-1 pl-3 pr-1 text-xs font-semibold text-app-text"
          key={filter.key}
        >
          {filter.label}
          <button
            aria-label={`Remove filter: ${filter.label}`}
            className="inline-flex size-5 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-border hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
            onClick={filter.onRemove}
            type="button"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </span>
      ))}
      {onClearAll ? (
        <Button
          className="min-h-7 px-2.5 text-xs"
          onClick={onClearAll}
          size="sm"
          variant="outline"
        >
          <X className="size-3.5" strokeWidth={2.5} />
          Clear all filters
        </Button>
      ) : null}
    </div>
  );
}
