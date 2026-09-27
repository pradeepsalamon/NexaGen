"use client";

import { Clock } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

type TimePickerProps = {
  /** 24h "HH:MM" */
  value: string;
  /** emits 24h "HH:MM" */
  onChange: (value: string) => void;
  className?: string;
  minuteStep?: number;
  "aria-label"?: string;
};

function parse(value: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return { hour: 12, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function to24(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TimePicker({
  value,
  onChange,
  className,
  minuteStep = 5,
  "aria-label": ariaLabel
}: TimePickerProps) {
  const { hour, minute } = parse(value);
  const meridiem: "AM" | "PM" = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const minutes = React.useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m < 60; m += minuteStep) list.push(m);
    if (!list.includes(minute)) list.push(minute);
    return list.sort((a, b) => a - b);
  }, [minute, minuteStep]);

  const label = value
    ? `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`
    : "--:--";

  const selectClass =
    "min-h-9 rounded-control border border-app-border bg-app-surface px-2 text-sm font-semibold text-app-text focus:border-primary focus:outline-none";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          aria-label={ariaLabel}
          variant="outline"
          className={cn(
            "min-h-11 w-full justify-start gap-2 rounded-full px-4 font-medium border border-app-border bg-app-surface text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] hover:bg-app-surface dark:border-app-border dark:text-app-text dark:hover:bg-app-surface",
            className
          )}
        >
          <Clock aria-hidden="true" className="size-4 shrink-0 text-app-muted" />
          <span className="flex-1 truncate text-left">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <div className="flex items-center gap-2">
          <select
            aria-label="Hour"
            className={selectClass}
            value={hour12}
            onChange={(e) => onChange(to24(Number(e.target.value), minute, meridiem))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className="font-bold text-app-muted">:</span>
          <select
            aria-label="Minute"
            className={selectClass}
            value={minute}
            onChange={(e) => onChange(to24(hour12, Number(e.target.value), meridiem))}
          >
            {minutes.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
          <select
            aria-label="AM or PM"
            className={selectClass}
            value={meridiem}
            onChange={(e) =>
              onChange(to24(hour12, minute, e.target.value as "AM" | "PM"))
            }
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
