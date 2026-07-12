"use client";

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      className={cn(
        "w-fit bg-white p-4 text-zinc-950 [--cell-size:2.25rem] dark:bg-zinc-950 dark:text-zinc-100",
        className
      )}
      classNames={{
        root: cn(
          "w-fit bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100",
          defaultClassNames.root
        ),
        months: cn("relative flex flex-col", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex h-[--cell-size] items-center justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "inline-flex size-[--cell-size] items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "inline-flex size-[--cell-size] items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[--cell-size] items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "select-none text-base font-bold text-zinc-950 dark:text-zinc-100",
          defaultClassNames.caption_label
        ),
        dropdowns: cn(
          "flex h-[--cell-size] items-center justify-center gap-2 text-sm font-medium text-zinc-950 dark:text-zinc-100",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-md border border-zinc-300 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-white text-zinc-950 opacity-0 dark:bg-zinc-950 dark:text-zinc-100",
          defaultClassNames.dropdown
        ),
        month_grid: cn(
          "w-full border-collapse border-spacing-0",
          defaultClassNames.month_grid
        ),
        weekdays: cn("flex gap-1", defaultClassNames.weekdays),
        weekday: cn(
          "flex size-[--cell-size] select-none items-center justify-center rounded-md text-[0.82rem] font-normal text-zinc-500 dark:text-zinc-500",
          defaultClassNames.weekday
        ),
        week: cn("mt-1.5 flex gap-1", defaultClassNames.week),
        week_number_header: cn(
          "size-[--cell-size] select-none text-zinc-500 dark:text-zinc-500",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "flex size-[--cell-size] items-center justify-center text-[0.82rem] font-normal text-zinc-500 dark:text-zinc-500",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative size-[--cell-size] select-none p-0 text-center text-zinc-950 dark:text-zinc-100",
          defaultClassNames.day
        ),
        today: cn("text-zinc-950 dark:text-zinc-100", defaultClassNames.today),
        selected: cn("text-white", defaultClassNames.selected),
        outside: cn(
          "text-zinc-300 opacity-80 aria-selected:text-zinc-300 dark:text-zinc-700 dark:aria-selected:text-zinc-700",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-zinc-300 opacity-50 dark:text-zinc-700",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        range_start: cn("text-white", defaultClassNames.range_start),
        range_middle: cn("text-zinc-100", defaultClassNames.range_middle),
        range_end: cn("text-white", defaultClassNames.range_end),
        ...classNames
      }}
      components={{
        Chevron: ({ className, orientation, ...chevronProps }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon
                className={cn("size-4", className)}
                {...chevronProps}
              />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...chevronProps}
              />
            );
          }

          return (
            <ChevronDownIcon
              className={cn("size-4", className)}
              {...chevronProps}
            />
          );
        },
        DayButton: CalendarDayButton,
        ...components
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex size-[--cell-size] items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-sm font-semibold leading-none text-zinc-950 transition-colors dark:text-zinc-100",
        "hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        "disabled:pointer-events-none disabled:opacity-50",
        modifiers.outside &&
          "text-zinc-300 opacity-80 hover:bg-transparent hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-600",
        modifiers.today &&
          !modifiers.selected &&
          "border-blue-500 text-zinc-950 ring-1 ring-blue-500 ring-offset-0 dark:text-zinc-100",
        modifiers.selected &&
          "border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white",
        className
      )}
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
