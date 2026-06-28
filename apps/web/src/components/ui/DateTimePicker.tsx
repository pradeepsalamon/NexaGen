"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";

type DateTimePickerProps = {
  className?: string;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  value: Date | undefined;
};

export function DateTimePicker({
  className,
  onChange,
  placeholder = "Pick a date & time",
  value
}: DateTimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(value);

  // Update local state when value prop changes (e.g. initial render)
  React.useEffect(() => {
    setDate(value);
  }, [value]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      setDate(undefined);
      onChange(undefined);
      return;
    }

    // Preserve time if it exists
    if (date) {
      selectedDate.setHours(date.getHours());
      selectedDate.setMinutes(date.getMinutes());
    } else {
      // Default to 12:00 PM
      selectedDate.setHours(12);
      selectedDate.setMinutes(0);
    }

    setDate(selectedDate);
    onChange(selectedDate);
  };

  const handleTimeChange = (type: "hour" | "minute" | "ampm", value: string) => {
    if (!date) return;
    const newDate = new Date(date);
    
    if (type === "minute") {
      newDate.setMinutes(parseInt(value, 10));
    } else if (type === "hour") {
      let h = parseInt(value, 10);
      const isPM = newDate.getHours() >= 12;
      if (isPM && h !== 12) h += 12;
      if (!isPM && h === 12) h = 0;
      newDate.setHours(h);
    } else if (type === "ampm") {
      const currentHours = newDate.getHours();
      const isPM = currentHours >= 12;
      if (value === "PM" && !isPM) {
        newDate.setHours(currentHours + 12);
      } else if (value === "AM" && isPM) {
        newDate.setHours(currentHours - 12);
      }
    }
    setDate(newDate);
    onChange(newDate);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-app-muted",
            className
          )}
          variant="outline"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP p") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          initialFocus
          mode="single"
          onSelect={handleDateSelect}
          selected={date}
        />
        <div className="flex items-center gap-2 border-t border-app-border p-3">
          <Select
            className="h-9 min-h-0 py-0"
            onChange={(e) => handleTimeChange("hour", e.target.value)}
            options={Array.from({ length: 12 }).map((_, i) => {
              const h = i === 0 ? 12 : i;
              return { label: h.toString().padStart(2, "0"), value: h.toString() };
            })}
            value={date ? (date.getHours() % 12 || 12).toString() : "12"}
          />
          <span className="font-bold text-app-muted">:</span>
          <Select
            className="h-9 min-h-0 py-0"
            onChange={(e) => handleTimeChange("minute", e.target.value)}
            options={Array.from({ length: 12 }).map((_, i) => ({
              label: (i * 5).toString().padStart(2, "0"),
              value: (i * 5).toString()
            }))}
            value={date ? (Math.floor(date.getMinutes() / 5) * 5).toString() : "0"}
          />
          <Select
            className="h-9 min-h-0 py-0"
            onChange={(e) => handleTimeChange("ampm", e.target.value)}
            options={[
              { label: "AM", value: "AM" },
              { label: "PM", value: "PM" }
            ]}
            value={date && date.getHours() >= 12 ? "PM" : "AM"}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
