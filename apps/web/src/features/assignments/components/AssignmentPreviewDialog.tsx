"use client";

import type { AssignmentLibraryItem, StudentAssignmentItem } from "@nexa-chess/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { DifficultyBadge } from "./assignmentBadges";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Pick<
    AssignmentLibraryItem | StudentAssignmentItem,
    "title" | "description" | "pgn" | "difficulty" | "pgnUrl"
  > | null;
}

export function AssignmentPreviewDialog({ open, onOpenChange, assignment }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {assignment?.title}
            {assignment && <DifficultyBadge difficulty={assignment.difficulty} />}
          </DialogTitle>
          {assignment?.description && (
            <DialogDescription>{assignment.description}</DialogDescription>
          )}
        </DialogHeader>

        {assignment && <PgnBoardViewer pgn={assignment.pgn} />}
      </DialogContent>
    </Dialog>
  );
}
