"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useAuthStore } from "@/stores/authStore";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { lazyOnOpen } from "@/lib/lazyOnOpen";

// The form (react-hook-form, the date picker, the puzzle-set editor) is
// downloaded when the coach first opens it — this button sits on the
// live-class board, where students would otherwise download it too.
const AssignmentFormDialog = lazyOnOpen(() => import("./AssignmentFormDialog"), "AssignmentFormDialog");

interface Props {
  /** The position to seed the assignment with (usually the live board FEN). */
  fen: string;
  className?: string;
}

// Coach-only shortcut from the live-class board: turn the position on the board
// into a SOLVE_LINE assignment. The form (position + solution editors, batch
// picker) is the same one used on the assignments page.
export function SendPositionButton({ fen, className }: Props) {
  const role = useAuthStore((state) => state.user?.role);
  const isCoach = role === "COACH";
  const { data } = useCoachBatches({ enabled: isCoach });
  const [open, setOpen] = useState(false);

  if (!isCoach) return null;

  return (
    <>
      <SimpleTooltip label="Create a solve-the-line assignment from this position">
        <Button
          variant="outline"
          size="sm"
          className={className}
          onClick={() => setOpen(true)}
        >
          <GraduationCap className="mr-1.5 size-4" strokeWidth={2.5} />
          Send as assignment
        </Button>
      </SimpleTooltip>
      <AssignmentFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="create"
        initialFen={fen}
        initialActivityType="SOLVE_LINE"
        coachBatches={data?.batches ?? []}
      />
    </>
  );
}
