"use client";

import { Check, CircleCheck } from "lucide-react";
import type { LiveMovePollOption } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

type Props = {
  options: LiveMovePollOption[];
  total: number;
  correctUci: string | null;
  /** The viewing student's own move, highlighted. */
  myUci?: string | null;
  /** Coach: mark / unmark a move as the answer. */
  onToggleCorrect?: (uci: string) => void;
};

/** Answers grouped by move, as horizontal bars. */
export function MovePollResults({ options, total, correctUci, myUci, onToggleCorrect }: Props) {
  if (options.length === 0) {
    return <p className="py-4 text-center text-sm text-app-muted">No answers yet.</p>;
  }
  const max = Math.max(...options.map((o) => o.count));

  return (
    <ul className="space-y-2">
      {options.map((option) => {
        const correct = option.uci === correctUci;
        const mine = option.uci === myUci;
        const share = total > 0 ? Math.round((option.count / total) * 100) : 0;
        return (
          <li key={option.uci} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("w-14 font-mono font-bold", correct && "text-success-ink")}>{option.san}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-control bg-app-soft">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-control", correct ? "bg-success/40" : "bg-primary/25")}
                  style={{ width: `${Math.max(6, (option.count / max) * 100)}%` }}
                />
                <span className="relative flex h-full items-center px-2 text-xs font-semibold text-app-text">
                  {option.count} · {share}%{mine ? " · your move" : ""}
                </span>
              </div>
              {onToggleCorrect ? (
                <SimpleTooltip label={correct ? "Unmark as the answer" : "Mark as the answer"}>
                  <button
                    type="button"
                    aria-label={correct ? `Unmark ${option.san} as the answer` : `Mark ${option.san} as the answer`}
                    aria-pressed={correct}
                    onClick={() => onToggleCorrect(option.uci)}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border transition",
                      correct
                        ? "border-transparent bg-success text-white hover:bg-success/85"
                        : "border-app-border text-app-muted hover:border-success/60 hover:text-success-ink"
                    )}
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </button>
                </SimpleTooltip>
              ) : correct ? (
                <CircleCheck className="size-5 shrink-0 text-success-ink" aria-label="Correct answer" />
              ) : null}
            </div>
            {option.studentNames.length > 0 ? (
              <p className="pl-16 text-xs text-app-muted">{option.studentNames.join(", ")}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
