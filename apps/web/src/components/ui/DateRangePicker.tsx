"use client";

import type {
  AnalyticsCompare,
  AnalyticsRangePreset
} from "@nexa-chess/types";
import { CalendarDays, Check } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";

export const RANGE_PRESETS: { value: AnalyticsRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "prevMonth", label: "Previous month" },
  { value: "thisYear", label: "This year" },
  { value: "prevYear", label: "Previous year" }
];

const COMPARE_OPTIONS: { value: AnalyticsCompare; label: string }[] = [
  { value: "prevPeriod", label: "vs previous period" },
  { value: "prevMonth", label: "vs previous month" },
  { value: "prevYear", label: "vs previous year" },
  { value: "none", label: "No comparison" }
];

interface DateRangeValue {
  preset?: AnalyticsRangePreset;
  from?: string;
  to?: string;
  compare?: AnalyticsCompare;
}

function labelFor(value: DateRangeValue): string {
  if (value.preset && value.preset !== "custom") {
    return RANGE_PRESETS.find((p) => p.value === value.preset)?.label ?? "Custom";
  }
  if (value.from && value.to) {
    // `from`/`to` are date-only ("YYYY-MM-DD") — render the calendar date as-is
    // (UTC), never shifted into a viewer zone.
    return `${formatFullDate(value.from, "UTC")} – ${formatFullDate(value.to, "UTC")}`;
  }
  return "Last 30 days";
}

export function DateRangePicker({
  value,
  onChange
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const toRange = (current: DateRangeValue): DateRange | undefined =>
    current.from && current.to
      ? { from: new Date(current.from), to: new Date(current.to) }
      : undefined;
  const [range, setRange] = useState<DateRange | undefined>(toRange(value));

  // A custom range is applied once, on close, not on every click.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setRange(toRange(value));
    } else if (range?.from && range.to) {
      const from = range.from.toISOString().slice(0, 10);
      const to = range.to.toISOString().slice(0, 10);
      if (from !== value.from || to !== value.to) {
        onChange({ ...value, preset: "custom", from, to });
      }
    }
    setOpen(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="min-w-[12rem] justify-between gap-2"
            size="sm"
            variant="outline"
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarDays className="size-4 shrink-0" strokeWidth={2.25} />
              {labelFor(value)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto max-w-[95vw] p-0">
          <div className="flex flex-col gap-1 border-b border-app-border p-2 sm:flex-row">
            <div className="flex flex-col gap-0.5 sm:w-40">
              {RANGE_PRESETS.map((preset) => (
                <button
                  className={cn(
                    "flex items-center justify-between rounded-control px-3 py-2 text-left text-sm hover:bg-app-soft",
                    value.preset === preset.value && "bg-app-soft font-semibold"
                  )}
                  key={preset.value}
                  onClick={() => {
                    setRange(undefined);
                    onChange({ ...value, preset: preset.value, from: undefined, to: undefined });
                    setOpen(false);
                  }}
                  type="button"
                >
                  {preset.label}
                  {value.preset === preset.value ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="border-t border-app-border pt-1 sm:border-l sm:border-t-0 sm:pl-1 sm:pt-0">
              <Calendar
                mode="range"
                numberOfMonths={1}
                onSelect={setRange}
                selected={range}
              />
              <div className="px-3 pb-3">
                <Button
                  className="w-full"
                  disabled={!range?.from || !range.to}
                  onClick={() => handleOpenChange(false)}
                  size="sm"
                  type="button"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Select
        aria-label="Comparison period"
        className="w-auto"
        onChange={(event) =>
          onChange({ ...value, compare: event.target.value as AnalyticsCompare })
        }
        options={COMPARE_OPTIONS}
        value={value.compare ?? "prevPeriod"}
      />
    </div>
  );
}
