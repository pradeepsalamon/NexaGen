"use client";

import type { ReferralStageItem } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { StageBadge } from "./StageBadge";

type FunnelStage = ReferralStageItem & { count: number };

type Props = {
  stages: FunnelStage[];
  /** What the number means, e.g. "reached" or "in stage". */
  countLabel: string;
  selectedStageId?: string | null;
  onSelect?: (stageId: string | null) => void;
};

/**
 * The pipeline as a row of stage tiles, each with a bar sized to the busiest
 * stage. Clickable (as a filter) when `onSelect` is given.
 */
export function ReferralFunnel({ countLabel, onSelect, selectedStageId, stages }: Props) {
  const max = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
      {stages.map((stage) => {
        const selected = selectedStageId === stage.id;
        const body = (
          <>
            <StageBadge name={stage.name} tone={stage.tone} />
            <p className="mt-3 text-2xl font-extrabold tabular-nums text-app-text">{stage.count}</p>
            <p className="text-xs text-app-muted">{countLabel}</p>
            <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-soft">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(stage.count / max) * 100}%` }} />
            </div>
          </>
        );
        const tileClass = cn(
          "h-full w-full rounded-app border bg-app-surface p-3 text-left shadow-card",
          selected ? "border-primary ring-2 ring-primary/30" : "border-app-border"
        );
        return (
          <li key={stage.id}>
            {onSelect ? (
              <button
                aria-pressed={selected}
                className={cn(
                  tileClass,
                  "transition-colors hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                )}
                onClick={() => onSelect(selected ? null : stage.id)}
                type="button"
              >
                {body}
              </button>
            ) : (
              <div className={tileClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
