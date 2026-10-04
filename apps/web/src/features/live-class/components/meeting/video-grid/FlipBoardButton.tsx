"use client";

import { ArrowDownUp } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

/**
 * Coach: flips the shared board's orientation, which syncs to every student.
 * Student: flips only their own view (`localFlip`), never broadcast.
 */
export function FlipBoardButton({ className }: { className?: string }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const orientation = useBoardStore((s) => s.orientation);
  const setOrientation = useBoardStore((s) => s.setOrientation);
  const localFlip = useBoardStore((s) => s.localFlip);
  const toggleLocalFlip = useBoardStore((s) => s.toggleLocalFlip);

  const label = isCoach
    ? "Flip board for everyone"
    : localFlip
      ? "Restore board orientation"
      : "Flip board (only for you)";
  const onClick = isCoach
    ? () => setOrientation(orientation === "white" ? "black" : "white")
    : toggleLocalFlip;
  const pressed = !isCoach && localFlip;

  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={isCoach ? undefined : pressed}
        onClick={onClick}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border border-app-border bg-app-surface/80 text-app-text shadow-card backdrop-blur-sm transition duration-150 hover:scale-105 hover:bg-app-surface",
          pressed && "border-primary text-primary-ink",
          className,
        )}
      >
        <ArrowDownUp className="size-3.5" strokeWidth={2.5} />
      </button>
    </SimpleTooltip>
  );
}
