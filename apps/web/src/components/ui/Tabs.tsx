"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { useSlidingIndicator } from "@/hooks/useSlidingIndicator";
import { cn } from "@/lib/utils";

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", className)}
    ref={ref}
    {...props}
  />
));
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ children, className, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  // One primary chip slides to the selected tab; the tab's own fill is the fallback until it is measured.
  const indicator = useSlidingIndicator(listRef, '[role="tab"][data-state="active"]');

  return (
    <TabsPrimitive.List
      className={cn(
        "group/tabs relative inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-control bg-app-soft p-1 text-app-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      data-indicator={indicator.ready ? "" : undefined}
      ref={setRef}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 top-0 rounded-md bg-primary",
          !indicator.ready && "hidden",
          !indicator.instant &&
            "motion-safe:transition-[transform,width,height] motion-safe:duration-300 motion-safe:ease-emphasized"
        )}
        style={indicator.style}
      />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    className={cn(
      "group relative inline-flex min-h-[var(--control-h-sm)] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium text-app-muted transition-colors duration-200 hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-on-primary data-[state=active]:hover:text-on-primary group-data-[indicator]/tabs:data-[state=active]:bg-transparent",
      className
    )}
    ref={ref}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    // Fades up on a switch; Radix skips it for the tab selected on first render.
    className={cn("outline-none motion-safe:data-[state=active]:animate-tab-panel-in", className)}
    ref={ref}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
