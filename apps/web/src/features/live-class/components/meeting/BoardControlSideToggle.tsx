"use client";

import type { BoardControlSide } from "@/features/chessboard/types/sync";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

type Option = { value: BoardControlSide | "none"; label: string; hint: string };

const OPTIONS: Option[] = [
  { value: "none", label: "Off", hint: "Cannot move pieces" },
  { value: "white", label: "White", hint: "May move white pieces only" },
  { value: "black", label: "Black", hint: "May move black pieces only" },
  { value: "both", label: "Both", hint: "May move either colour" },
];

export function boardControlSideLabel(side: BoardControlSide | null | undefined) {
  if (side === "white") return "White";
  if (side === "black") return "Black";
  if (side === "both") return "Both colours";
  return "No control";
}

/**
 * Coach control: which pieces one student may move on the shared board.
 * `null` means the student holds no board control at all.
 */
export function BoardControlSideToggle({
  className,
  onChange,
  studentName,
  value,
}: {
  className?: string;
  onChange: (next: BoardControlSide | null) => void;
  /** Used for the accessible label so a list of these stays distinguishable. */
  studentName?: string;
  value: BoardControlSide | null;
}) {
  const current = value ?? "none";

  return (
    <div
      role="group"
      aria-label={studentName ? `Board control for ${studentName}` : "Board control"}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full bg-app-soft p-0.5 ring-1 ring-app-border/60",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const isActive = current === option.value;
        return (
          <SimpleTooltip key={option.value} label={option.hint}>
            <button
              type="button"
              aria-pressed={isActive}
              aria-label={
                studentName ? `${option.label} — ${option.hint} (${studentName})` : option.label
              }
              onClick={() => onChange(option.value === "none" ? null : option.value)}
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-semibold leading-none transition-colors",
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "text-app-muted hover:bg-app-surface hover:text-app-text",
              )}
            >
              {option.label}
            </button>
          </SimpleTooltip>
        );
      })}
    </div>
  );
}
