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
        "group flex h-full flex-col justify-between gap-3 rounded-app border border-app-border bg-app-surface p-4 shadow-card transition",
        href && "hover:border-primary hover:shadow-soft"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-app-muted">
          {label}
        </span>
        <div className="flex items-center gap-1 text-app-muted">
          {tooltip ? (
            <SimpleTooltip label={tooltip}>
              <button
                aria-label={`How ${label} is calculated`}
                className="rounded-full p-0.5 hover:text-app-text"
                type="button"
              >
                <Info className="size-3.5" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
          ) : null}
          {Icon ? <Icon className="size-4" strokeWidth={2.25} /> : null}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-extrabold text-app-text">
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
  const up = kpi.deltaPct > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-semibold",
        good ? "text-accent" : "text-app-danger"
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
