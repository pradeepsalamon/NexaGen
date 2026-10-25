import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";

/**
 * Says why the board takes no moves while it shows a set-up only position
 * (missing / extra kings, a pawn on the back rank, ...). Renders nothing for a
 * normal game.
 */
export function SetupOnlyNotice({ className }: { className?: string }) {
  const issues = useBoardStore((s) => s.positionIssues);
  const freeMoves = useBoardStore((s) => s.allowIllegalMoves);
  if (issues.length === 0) return null;
  return (
    <p
      role="status"
      data-testid="setup-only-notice"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning-ink",
        className,
      )}
    >
      <TriangleAlert className="size-3.5 shrink-0" strokeWidth={2.5} />
      <span>
        Set-up position — {freeMoves ? "illegal moves only" : "moves are off"} ({issues.join(", ")})
      </span>
    </p>
  );
}
