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
  className?: string;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  value: Date | undefined;
  withTime?: boolean;
};

export function DatePicker({
  className,
  onChange,
  placeholder,
  value,
  withTime = false
}: DatePickerProps) {
  const [dateTimeValue, setDateTimeValue] = React.useState<Date | undefined>(
    value
  );

  React.useEffect(() => {
    if (withTime) {
      setDateTimeValue(value);
    }
  }, [value, withTime]);

  const selectedDate = withTime
    ? dateTimeValue
    : value
      ? normalizeDateOnlyValue(value)
      : undefined;
  const displayPlaceholder =
    placeholder ?? (withTime ? "Pick a date & time" : "Pick a date");

  const handleSelect = (date: Date | undefined) => {
    if (!withTime) {
      onChange(date ? toIsoSafeDateOnly(date) : undefined);
      return;
    }

    if (!date) {
      setDateTimeValue(undefined);
      onChange(undefined);
      return;
    }

    const nextDate = new Date(date);

    if (dateTimeValue) {
      nextDate.setHours(dateTimeValue.getHours(), dateTimeValue.getMinutes());
    } else {
      nextDate.setHours(12, 0);
    }
    nextDate.setSeconds(0, 0);

    setDateTimeValue(nextDate);
    onChange(nextDate);
  };

  const handleTimeChange = (
    type: "hour" | "minute" | "ampm",
    nextValue: string
  ) => {
    const nextDate = selectedDate ? new Date(selectedDate) : new Date();
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

    setDateTimeValue(nextDate);
    onChange(nextDate);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "min-h-11 justify-start rounded-full px-4 py-2 text-left text-sm font-medium border border-app-border bg-app-surface text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] hover:bg-app-surface hover:text-app-text dark:border-app-border dark:text-app-text dark:hover:bg-app-surface",
            withTime ? "w-full" : "w-[266px]",
            !value && "text-app-muted dark:text-app-muted",
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
            className="ml-3 size-4 shrink-0 text-zinc-500 dark:text-zinc-300"
          />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="w-auto p-0 border-0 bg-transparent shadow-none sm:rounded-lg overflow-hidden flex flex-col items-center justify-center [&>button]:hidden"
      >
        <div className="bg-white dark:bg-zinc-950 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">

        <Calendar
          autoFocus
          mode="single"
          onSelect={handleSelect}
          selected={selectedDate}
        />
        {withTime ? (
          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <Clock className="size-4.5 text-zinc-500 dark:text-zinc-400" />
              <span>Time:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer"
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
              <span className="font-bold text-zinc-400 text-sm">:</span>
              <select
                className="h-9.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer"
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
                className="h-9.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer"
                onChange={(event) => handleTimeChange("ampm", event.target.value)}
                value={selectedDate && selectedDate.getHours() >= 12 ? "PM" : "AM"}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
        ) : null}
        
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <DialogClose asChild>
            <Button variant="primary" size="sm" className="w-full bg-secondary hover:bg-secondary/90 text-app-text font-semibold">
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

