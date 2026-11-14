"use client";

import type { KpiValue } from "@nexa-chess/types";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  kpi?: KpiValue | null;
  icon?: LucideIcon;
  /** How to render the value: default number, "hours", "percent", "bytesGb". */
  unit?: "count" | "hours" | "percent" | "gb";
  href?: string;
  tooltip?: string;
  isLoading?: boolean;
  /** true if higher is worse (e.g. cancellations) — flips delta colour */
  invertDelta?: boolean;
}

function formatValue(value: number | null, unit: KpiCardProps["unit"]): string {
  if (value === null || value === undefined) return "—";
  if (unit === "percent") return `${value}%`;
  if (unit === "hours") return `${value.toLocaleString()} h`;
  if (unit === "gb") return `${value.toLocaleString()} GB`;
  return value.toLocaleString();
}

export function KpiCard({
  label,
  kpi,
  icon: Icon,
  unit = "count",
  href,
  tooltip,
  isLoading,
  invertDelta
}: KpiCardProps) {
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between gap-3 rounded-[20px] border border-app-border bg-app-surface p-4 shadow-card transition",
        href && "hover:border-primary hover:shadow-soft"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-control border border-primary/25 bg-primary/10 text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-colors group-hover:bg-primary/15"
            >
              <Icon className="size-4" strokeWidth={2.25} />
            </span>
          ) : null}
          <span className="text-sm font-semibold text-app-muted">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-app-muted">
          {tooltip ? (
            <SimpleTooltip label={tooltip}>
              <button
                aria-label={`How ${label} is calculated`}
                className="rounded-full p-0.5 hover:text-app-text"
                // Inside a linked card: opening the tooltip must not navigate.
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                type="button"
              >
                <Info className="size-3.5" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="flex items-end justify-between gap-2">
          <span className="font-display text-2xl font-extrabold tabular-nums text-app-text">
            {formatValue(kpi?.value ?? null, unit)}
          </span>
          <DeltaChip kpi={kpi} invert={invertDelta} />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link className="block h-full" href={href}>
        {body}
      </Link>
    );
  }
  return body;
}

function DeltaChip({
  kpi,
  invert
}: {
  kpi?: KpiValue | null;
  invert?: boolean;
}) {
  if (!kpi || kpi.insufficientHistory || kpi.deltaPct === null) {
    return kpi && !kpi.insufficientHistory ? (
      <span className="flex items-center gap-0.5 text-xs text-app-muted">
        <ArrowRight className="size-3" /> 0%
      </span>
    ) : null;
  }
  if (kpi.deltaPct === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-app-muted">
        <ArrowRight className="size-3" /> 0%
      </span>
    );
  }
  const up = kpi.deltaPct > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-semibold",
        good ? "text-accent-ink" : "text-app-danger-ink"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
      ) : (
        <ArrowDownRight className="size-3.5" strokeWidth={2.5} />
      )}
      {Math.abs(kpi.deltaPct)}%
    </span>
  );
}
