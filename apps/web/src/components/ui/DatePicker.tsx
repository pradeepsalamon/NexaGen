"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, Clock } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose
} from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";


type DatePickerProps = {
  "aria-label"?: string;
  className?: string;
  id?: string;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  value: Date | undefined;
  withTime?: boolean;
};

export function DatePicker({
  "aria-label": ariaLabel,
  className,
  id,
  onChange,
  placeholder,
  value,
  withTime = false
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  // Edits stay local until the dialog closes, so the parent (and any query
  // keyed on it) sees one change instead of one per click.
  const [draft, setDraft] = React.useState<Date | undefined>(undefined);
  const initial = React.useRef<Date | undefined>(undefined);

  const committedDate = withTime
    ? value
    : value
      ? normalizeDateOnlyValue(value)
      : undefined;
  const selectedDate = open ? draft : committedDate;
  const displayPlaceholder =
    placeholder ?? (withTime ? "Pick a date & time" : "Pick a date");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      initial.current = committedDate;
      setDraft(committedDate);
    } else if (draft?.getTime() !== initial.current?.getTime()) {
      onChange(draft);
    }
    setOpen(next);
  };

  const handleSelect = (date: Date | undefined) => {
    if (!withTime) {
      setDraft(date ? toIsoSafeDateOnly(date) : undefined);
      return;
    }

    if (!date) {
      setDraft(undefined);
      return;
    }

    const nextDate = new Date(date);

    if (draft) {
      nextDate.setHours(draft.getHours(), draft.getMinutes());
    } else {
      nextDate.setHours(12, 0);
    }
    nextDate.setSeconds(0, 0);

    setDraft(nextDate);
  };

  const handleTimeChange = (
    type: "hour" | "minute" | "ampm",
    nextValue: string
  ) => {
    const nextDate = draft ? new Date(draft) : new Date();
    nextDate.setSeconds(0, 0);

    if (type === "minute") {
      nextDate.setMinutes(parseInt(nextValue, 10));
    } else if (type === "hour") {
      let hour = parseInt(nextValue, 10);
      const isPm = nextDate.getHours() >= 12;
      if (isPm && hour !== 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      nextDate.setHours(hour);
    } else {
      const currentHours = nextDate.getHours();
      const isPm = currentHours >= 12;
      if (nextValue === "PM" && !isPm) {
        nextDate.setHours(currentHours + 12);
      } else if (nextValue === "AM" && isPm) {
        nextDate.setHours(currentHours - 12);
      }
    }

    setDraft(nextDate);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label={ariaLabel}
          id={id}
          variant="outline"
          className={cn(
            "min-h-11 justify-start rounded-full px-4 py-2 text-left text-sm font-medium border border-app-border bg-app-surface text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] hover:bg-app-surface hover:text-app-text",
            withTime ? "w-full" : "w-full min-w-0 max-w-[266px]",
            !value && "text-app-muted",
            className
          )}
        >
          <CalendarIcon
            aria-hidden="true"
            className="mr-2 size-4 shrink-0 text-app-muted"
          />
          <span className="min-w-0 flex-1 truncate">
            {selectedDate
              ? format(selectedDate, withTime ? "PP p" : "PPP")
              : displayPlaceholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="ml-3 size-4 shrink-0 text-app-muted"
          />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="w-auto p-0 border-0 bg-transparent shadow-none sm:rounded-panel overflow-hidden flex flex-col items-center justify-center [&>button]:hidden"
      >
        <div className="overflow-hidden rounded-panel border border-app-border bg-app-surface shadow-soft">

        <Calendar
          autoFocus
          mode="single"
          onSelect={handleSelect}
          selected={selectedDate}
        />
        {withTime ? (
          <div className="flex items-center justify-between gap-3 border-t border-app-border bg-app-soft px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-app-text">
              <Clock className="size-4.5 text-app-muted" />
              <span>Time:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9.5 cursor-pointer rounded-control border border-app-border bg-app-surface px-2.5 py-1 text-sm font-semibold text-app-text transition hover:border-primary/50 focus:border-primary focus:outline-none"
                onChange={(event) => handleTimeChange("hour", event.target.value)}
                value={
                  selectedDate ? (selectedDate.getHours() % 12 || 12).toString() : "12"
                }
              >
                {Array.from({ length: 12 }).map((_, index) => {
                  const hour = index === 0 ? 12 : index;
                  return (
                    <option key={hour} value={hour.toString()}>
                      {hour.toString().padStart(2, "0")}
                    </option>
                  );
                })}
              </select>
              <span className="text-sm font-bold text-app-muted">:</span>
              <select
                className="h-9.5 cursor-pointer rounded-control border border-app-border bg-app-surface px-2.5 py-1 text-sm font-semibold text-app-text transition hover:border-primary/50 focus:border-primary focus:outline-none"
                onChange={(event) =>
                  handleTimeChange("minute", event.target.value)
                }
                value={
                  selectedDate
                    ? (Math.floor(selectedDate.getMinutes() / 5) * 5).toString()
                    : "0"
                }
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <option key={index} value={(index * 5).toString()}>
                    {(index * 5).toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
              <select
                className="h-9.5 cursor-pointer rounded-control border border-app-border bg-app-surface px-2.5 py-1 text-sm font-semibold text-app-text transition hover:border-primary/50 focus:border-primary focus:outline-none"
                onChange={(event) => handleTimeChange("ampm", event.target.value)}
                value={selectedDate && selectedDate.getHours() >= 12 ? "PM" : "AM"}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
        ) : null}
        
        <div className="border-t border-app-border bg-app-surface p-3">
          <DialogClose asChild>
            <Button variant="primary" size="sm" className="w-full">
              Done
            </Button>
          </DialogClose>
        </div>
        
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getIsoSafeLocalHour(date: Date) {
  return Math.ceil(Math.max(0, -date.getTimezoneOffset()) / 60);
}

function toIsoSafeDateOnly(date: Date) {
  const safeDate = new Date(date);
  safeDate.setHours(getIsoSafeLocalHour(date), 0, 0, 0);
  return safeDate;
}

function normalizeDateOnlyValue(date: Date) {
  const looksLikeDateOnlyUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!looksLikeDateOnlyUtc) {
    return date;
  }

  const normalized = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  return toIsoSafeDateOnly(normalized);
}


const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `DatePicker` for string-valued state: `"YYYY-MM-DD"`, or with `withTime`
 * `"YYYY-MM-DDTHH:mm"` (the `datetime-local` format). Parsed and emitted in
 * the browser's local zone, exactly like the native inputs it replaces; `""`
 * means empty.
 */
export function DateStringPicker({
  onChange,
  value,
  withTime = false,
  ...props
}: Omit<DatePickerProps, "onChange" | "value"> & {
  onChange: (value: string) => void;
  value: string;
}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  const date = match
    ? new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] ?? 0),
        Number(match[5] ?? 0)
      )
    : undefined;

  return (
    <DatePicker
      {...props}
      onChange={(next) => {
        if (!next) return onChange("");
        const day = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
        onChange(withTime ? `${day}T${pad(next.getHours())}:${pad(next.getMinutes())}` : day);
      }}
      value={date}
      withTime={withTime}
    />
  );
}
