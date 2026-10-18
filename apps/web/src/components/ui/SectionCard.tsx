"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { formatFullDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

interface SectionCardProps {
  title: string;
  description?: string;
  /** ISO string; rendered as "Updated …" */
  updatedAt?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  /** collapsible on mobile (starts open) */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
  className?: string;
}

function relative(iso: string | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatFullDate(iso, timeZone);
}

export function SectionCard({
  title,
  description,
  updatedAt,
  onRefresh,
  actions,
  collapsible,
  defaultCollapsed = false,
  children,
  className
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const tz = useUserTimeZone();
  const updated = relative(updatedAt, tz);

  return (
    <section
      className={cn(
        "rounded-app border border-app-border bg-app-surface shadow-card",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-app-text sm:text-lg">
              {title}
            </h2>
            {collapsible ? (
              <SimpleTooltip label={collapsed ? "Expand" : "Collapse"}>
                <button
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                  className="rounded-full p-1 text-app-muted hover:bg-app-soft md:hidden"
                  onClick={() => setCollapsed((c) => !c)}
                  type="button"
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", !collapsed && "rotate-180")}
                    strokeWidth={2.5}
                  />
                </button>
              </SimpleTooltip>
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-sm text-app-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {updated ? (
            <span className="hidden text-xs text-app-muted sm:inline">
              Updated {updated}
            </span>
          ) : null}
          {onRefresh ? (
            <SimpleTooltip label="Refresh this section">
              <Button
                aria-label="Refresh section"
                className="size-8 rounded-full p-0"
                onClick={onRefresh}
                size="icon"
                variant="outline"
              >
                <RefreshCw className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          ) : null}
        </div>
      </header>
      <div className={cn("p-4 sm:p-5", collapsible && collapsed && "hidden md:block")}>
        {children}
      </div>
    </section>
  );
}
