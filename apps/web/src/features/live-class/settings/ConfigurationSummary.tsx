"use client";

import { Check } from "lucide-react";
import type { LiveClassSettings } from "@nexa-chess/types";
import { summaryRows } from "./fields";

/** Compact read-only recap of the effective config (§27). */
export function ConfigurationSummary({
  resolved,
  title = "Configuration summary",
}: {
  resolved: LiveClassSettings;
  title?: string;
}) {
  return (
    <div className="rounded-app border border-app-border bg-app-soft/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{title}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {summaryRows(resolved).map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
            <dt className="flex items-center gap-1.5 text-app-muted">
              <Check className="size-3.5 shrink-0 text-primary" strokeWidth={3} />
              {row.label}
            </dt>
            <dd className="text-right font-semibold text-app-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
