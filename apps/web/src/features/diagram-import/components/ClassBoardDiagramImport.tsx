"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { DiagramImportWorkbench } from "./DiagramImportWorkbench";
import { DiagramPositionActions } from "./DiagramPositionActions";

type Props = {
  /** Puts the position on the shared board (the board's own load action, so it syncs and persists). */
  onLoad: (fen: string) => void;
  libraryBasePath: string;
  /** Something running in class the coach should know about before replacing the board. */
  activityNote?: string;
};

/**
 * The "From PDF" tab of the coach's Setup Position dialog. A confirmed
 * position goes onto the shared board only after a second confirmation, since
 * it replaces what every student is looking at.
 */
export function ClassBoardDiagramImport({ activityNote, libraryBasePath, onLoad }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  return (
    <>
      <DiagramImportWorkbench
        actions={(confirmed) => (
          <DiagramPositionActions analysis={false} confirmed={confirmed} libraryBasePath={libraryBasePath} libraryInNewTab>
            <Button data-testid="diagram-load-class" onClick={() => setPending(confirmed.fen)}>
              <Upload className="size-4" strokeWidth={2.5} />
              Load on class board
            </Button>
          </DiagramPositionActions>
        )}
        compact
      />
      <AlertDialog onOpenChange={(open) => !open && setPending(null)} open={pending !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="space-y-2">
              <AlertDialogTitle>Replace the shared board?</AlertDialogTitle>
              <AlertDialogDescription>
                Every student&apos;s board switches to this position and the current move list is cleared.
                {activityNote ? ` ${activityNote}` : ""}
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                data-testid="diagram-load-class-confirm"
                onClick={() => {
                  if (pending) onLoad(pending);
                  setPending(null);
                }}
              >
                Replace board
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
