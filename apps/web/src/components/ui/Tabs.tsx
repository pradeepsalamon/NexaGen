"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { useSlidingIndicator } from "@/hooks/useSlidingIndicator";
import { cn } from "@/lib/utils";

/** The selected tab and a setter, so a collapsed `TabsList` can switch tabs from its menu. */
const TabsValueContext = React.createContext<{
  setValue: (value: string) => void;
  value: string | undefined;
} | null>(null);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, defaultValue, onValueChange, value: controlled, ...props }, ref) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const setValue = React.useCallback(
    (next: string) => {
      if (controlled === undefined) setUncontrolled(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange]
  );
  const context = React.useMemo(() => ({ setValue, value }), [setValue, value]);

  return (
    <TabsValueContext.Provider value={context}>
      <TabsPrimitive.Root
        className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", className)}
        onValueChange={setValue}
        ref={ref}
        value={value}
        {...props}
      />
    </TabsValueContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

type TriggerInfo = { disabled?: boolean; label: React.ReactNode; value: string };

/** Every `TabsTrigger` among `children`, looking through fragments. */
function collectTriggers(children: React.ReactNode): TriggerInfo[] {
  const found: TriggerInfo[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { children?: React.ReactNode; disabled?: boolean; value?: string };
    if (child.type === TabsTrigger && typeof props.value === "string") {
      found.push({ disabled: props.disabled, label: props.children, value: props.value });
    } else if (child.type === React.Fragment) {
      found.push(...collectTriggers(props.children));
    }
  });
  return found;
}

/**
 * The tab strip. When the tabs don't fit the space they're given, the strip
 * becomes one button showing the selected tab that opens a menu of all tabs —
 * never a sideways-scrolling row (owner, 2026-11-06).
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ children, className, ...props }, forwardedRef) => {
  const context = React.useContext(TabsValueContext);
  const triggers = collectTriggers(children);
  const canCollapse = context !== null && triggers.length > 1;

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    listRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  // One primary chip slides to the selected tab; the tab's own fill is the fallback until it is measured.
  const indicator = useSlidingIndicator(listRef, '[role="tab"][data-state="active"]');
  const [collapsed, setCollapsed] = React.useState(false);
  // False until the first measure. The server can't know the width, so its HTML (and a phone's
  // first paint before hydration) would show the full strip running off-screen and then snap
  // into the menu; until measured the strip keeps its space but isn't drawn.
  const [measured, setMeasured] = React.useState(false);
  // Bumped when the available width changes: show the full strip again, re-measure.
  const [measure, setMeasure] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!canCollapse || collapsed) return;
    const list = listRef.current;
    if (!list) return;
    // Too wide for one row: it either overflows or (where a caller lets it wrap) breaks onto more lines.
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
    const wraps = tabs.some((tab) => tab.offsetTop !== tabs[0]?.offsetTop);
    if (wraps || list.scrollWidth > list.clientWidth + 1) setCollapsed(true);
    setMeasured(true);
  }, [canCollapse, collapsed, measure, triggers.length]);

  React.useEffect(() => {
    const parent = listRef.current?.parentElement;
    if (!canCollapse || !parent || typeof ResizeObserver === "undefined") return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      setCollapsed(false);
      setMeasure((n) => n + 1);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canCollapse]);

  // A collapsed strip in a content-sized parent (a page header) never sees that parent grow, so
  // a wider window is the cue to try the full strip again.
  React.useEffect(() => {
    if (!canCollapse || !collapsed) return;
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setCollapsed(false);
      setMeasure((n) => n + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [canCollapse, collapsed]);

  // Page tabs sit on the right like every page control (UI_RULES §4); a caller's `w-full` or
  // `justify-self-start` still wins.
  const base =
    "group/tabs relative inline-flex w-fit max-w-full justify-self-end items-center gap-1 overflow-x-auto rounded-control bg-app-soft p-1 text-app-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  if (canCollapse && collapsed && context) {
    const active = triggers.find((t) => t.value === context.value) ?? triggers[0];
    return (
      <TabsPrimitive.List className={cn(base, className, "w-full overflow-visible")} ref={setRefs} {...props}>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Choose a tab"
            className="inline-flex min-h-[var(--control-h-sm)] w-full items-center justify-between gap-2 rounded-md bg-button px-4 text-sm font-medium text-on-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          >
            <span className="flex min-w-0 items-center gap-2 truncate">{active.label}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {triggers.map((tab) => (
              <DropdownMenuItem
                className="justify-between gap-2"
                disabled={tab.disabled}
                key={tab.value}
                onSelect={() => context.setValue(tab.value)}
              >
                <span className="flex min-w-0 items-center gap-2">{tab.label}</span>
                {tab.value === active.value ? (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TabsPrimitive.List>
    );
  }

  return (
    <TabsPrimitive.List
      className={cn(base, className, canCollapse && !measured && "invisible")}
      data-indicator={indicator.ready ? "" : undefined}
      ref={setRefs}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 top-0 rounded-md bg-button",
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
      "group relative inline-flex min-h-[var(--control-h-sm)] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium text-app-muted transition-colors duration-200 hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-button data-[state=active]:text-on-button data-[state=active]:hover:text-on-button group-data-[indicator]/tabs:data-[state=active]:bg-transparent",
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
