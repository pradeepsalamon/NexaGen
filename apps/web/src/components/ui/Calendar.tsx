"use client";

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  captionLayout = "dropdown",
  classNames,
  components,
  endMonth = new Date(new Date().getFullYear() + 10, 11),
  showOutsideDays = true,
  startMonth = new Date(new Date().getFullYear() - 100, 0),
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      className={cn(
        "w-fit bg-app-surface p-4 text-app-text [--cell-size:2.25rem]",
        className
      )}
      classNames={{
        root: cn(
          "w-fit bg-app-surface text-app-text",
          defaultClassNames.root
        ),
        months: cn("relative flex flex-col", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex h-[--cell-size] items-center justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "inline-flex size-[--cell-size] items-center justify-center rounded-control border border-transparent bg-transparent p-0 text-app-muted transition hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "inline-flex size-[--cell-size] items-center justify-center rounded-control border border-transparent bg-transparent p-0 text-app-muted transition hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[--cell-size] items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          captionLayout === "label"
            ? "select-none text-base font-bold text-app-text"
            : "flex h-8 select-none items-center gap-1 rounded-control pl-2.5 pr-1.5 text-sm font-bold text-app-text [&>svg]:size-3.5 [&>svg]:text-app-muted",
          defaultClassNames.caption_label
        ),
        dropdowns: cn(
          "flex h-[--cell-size] items-center justify-center gap-2 text-sm font-medium text-app-text",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-control border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-focus",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 cursor-pointer bg-app-surface text-app-text opacity-0",
          defaultClassNames.dropdown
        ),
        month_grid: cn(
          "w-full border-collapse border-spacing-0",
          defaultClassNames.month_grid
        ),
        weekdays: cn("flex gap-1", defaultClassNames.weekdays),
        weekday: cn(
          "flex size-[--cell-size] select-none items-center justify-center rounded-control text-[0.82rem] font-normal text-app-muted",
          defaultClassNames.weekday
        ),
        week: cn("mt-1.5 flex gap-1", defaultClassNames.week),
        week_number_header: cn(
          "size-[--cell-size] select-none text-app-muted",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "flex size-[--cell-size] items-center justify-center text-[0.82rem] font-normal text-app-muted",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative size-[--cell-size] select-none p-0 text-center text-app-text",
          defaultClassNames.day
        ),
        today: cn("text-app-text", defaultClassNames.today),
        selected: cn("text-white", defaultClassNames.selected),
        outside: cn(
          "text-app-muted/50 opacity-80 aria-selected:text-app-muted/50",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-app-muted/50 opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        range_start: cn("text-white", defaultClassNames.range_start),
        range_middle: cn("text-app-text", defaultClassNames.range_middle),
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
      captionLayout={captionLayout}
      endMonth={endMonth}
      showOutsideDays={showOutsideDays}
      startMonth={startMonth}
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
        "inline-flex size-[--cell-size] items-center justify-center rounded-control border border-transparent bg-transparent p-0 text-sm font-semibold leading-none text-app-text transition-colors",
        "hover:bg-app-soft hover:text-app-text",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        modifiers.outside &&
          "text-app-muted/50 opacity-80 hover:bg-transparent hover:text-app-muted",
        modifiers.today &&
          !modifiers.selected &&
          "border-primary text-app-text ring-1 ring-primary ring-offset-0",
        modifiers.selected &&
          "border-primary bg-primary text-on-primary hover:bg-primary hover:text-on-primary",
        className
      )}
      data-day={`${day.date.getFullYear()}-${day.date.getMonth() + 1}-${day.date.getDate()}`}
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
