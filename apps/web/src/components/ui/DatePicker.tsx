"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
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
    onChange(toIsoSafeDateTime(nextDate));
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
    onChange(toIsoSafeDateTime(nextDate));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 min-h-10 justify-start rounded-md border-zinc-300 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-950 shadow-none hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
            withTime ? "w-full" : "w-[266px]",
            !value && "text-zinc-500 dark:text-zinc-400",
            className
          )}
        >
          <CalendarIcon
            aria-hidden="true"
            className="mr-2 size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <span className="min-w-0 flex-1 truncate">
            {selectedDate
              ? format(selectedDate, withTime ? "PPP p" : "PPP")
              : displayPlaceholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="ml-3 size-4 shrink-0 text-zinc-500 dark:text-zinc-300"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto rounded-lg border-zinc-200 bg-white p-0 text-zinc-950 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <Calendar
          autoFocus
          mode="single"
          onSelect={handleSelect}
          selected={selectedDate}
        />
        {withTime ? (
          <div className="flex items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <Select
              className="h-9 min-h-0 rounded-md border-zinc-300 bg-white py-0 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              onChange={(event) => handleTimeChange("hour", event.target.value)}
              options={Array.from({ length: 12 }).map((_, index) => {
                const hour = index === 0 ? 12 : index;
                return {
                  label: hour.toString().padStart(2, "0"),
                  value: hour.toString()
                };
              })}
              value={
                selectedDate ? (selectedDate.getHours() % 12 || 12).toString() : "12"
              }
            />
            <span className="font-bold text-zinc-500 dark:text-zinc-400">:</span>
            <Select
              className="h-9 min-h-0 rounded-md border-zinc-300 bg-white py-0 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              onChange={(event) =>
                handleTimeChange("minute", event.target.value)
              }
              options={Array.from({ length: 12 }).map((_, index) => ({
                label: (index * 5).toString().padStart(2, "0"),
                value: (index * 5).toString()
              }))}
              value={
                selectedDate
                  ? (Math.floor(selectedDate.getMinutes() / 5) * 5).toString()
                  : "0"
              }
            />
            <Select
              className="h-9 min-h-0 rounded-md border-zinc-300 bg-white py-0 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              onChange={(event) => handleTimeChange("ampm", event.target.value)}
              options={[
                { label: "AM", value: "AM" },
                { label: "PM", value: "PM" }
              ]}
              value={selectedDate && selectedDate.getHours() >= 12 ? "PM" : "AM"}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
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

function toIsoSafeDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}
