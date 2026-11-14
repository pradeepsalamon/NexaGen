"use client";

import { ClipboardPaste, Copy, Cpu, Loader2, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { uploadPgn } from "@/lib/uploadApi";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";
import { useEngineMove } from "../../hooks/useEngineMove";
import { useShallow } from "zustand/react/shallow";
import { NavIconButton } from "../toolbars/BoardNavigation";

/** Coach's board actions: save, setup position, undo/redo, PGN copy/paste, engine move. */
export function BoardActionsRow({ onPastePgn, className }: { onPastePgn: () => void; className?: string }) {
  const { pgn, undo, redo, historyIndex, moveHistory, isGameOver, setIsSetupPositionOpen, hasFreeUndo, hasFreeRedo } = useBoardStore(
    useShallow((s) => ({
      pgn: s.pgn,
      undo: s.undo,
      redo: s.redo,
      historyIndex: s.historyIndex,
      moveHistory: s.moveHistory,
      isGameOver: s.isGameOver,
      setIsSetupPositionOpen: s.setIsSetupPositionOpen,
      // Undo / Redo also step across illegal (free) moves.
      hasFreeUndo: s.freeMoveUndo.length > 0,
      hasFreeRedo: s.freeMoveRedo.length > 0,
    })),
  );
  const { isEngineMoving, playEngineMove } = useEngineMove();

  const handleSaveToCloud = async () => {
    if (!pgn) {
      toast.error("No PGN to save.");
      return;
    }
    try {
      const { url } = await uploadPgn(pgn, "game.pgn");
      await navigator.clipboard.writeText(url);
      toast.success("PGN saved to Cloud! URL copied to clipboard.");
    } catch {
      toast.error("Failed to save PGN to Cloud.");
    }
  };

  const handleCopyPGN = async () => {
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      toast.success("PGN copied to clipboard!");
    } else {
      toast.error("No PGN to copy");
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="primary"
        className="h-auto bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary"
        onClick={handleSaveToCloud}
      >
        Save
      </Button>
      <Button
        variant="outline"
        onClick={() => setIsSetupPositionOpen(true)}
        className="h-auto border-app-border bg-app-surface px-3 py-1.5 text-xs font-normal text-app-muted hover:bg-app-soft"
      >
        Setup Position
      </Button>
      <SimpleTooltip label="Undo">
        <NavIconButton aria-label="Undo" icon={<Undo2 className="size-4" />} onClick={undo} disabled={historyIndex < 0 && !hasFreeUndo} />
      </SimpleTooltip>
      <SimpleTooltip label="Redo">
        <NavIconButton
          aria-label="Redo"
          icon={<Redo2 className="size-4" />}
          onClick={redo}
          disabled={historyIndex >= moveHistory.length - 1 && !hasFreeRedo}
        />
      </SimpleTooltip>
      <SimpleTooltip label="Copy PGN">
        <NavIconButton aria-label="Copy PGN" icon={<Copy className="size-4" />} onClick={handleCopyPGN} />
      </SimpleTooltip>
      <SimpleTooltip label="Paste PGN">
        <NavIconButton aria-label="Paste PGN" icon={<ClipboardPaste className="size-4" />} onClick={onPastePgn} />
      </SimpleTooltip>
      <SimpleTooltip label={isEngineMoving ? "Thinking…" : "Engine Move"}>
        <NavIconButton
          aria-label={isEngineMoving ? "Thinking…" : "Engine Move"}
          icon={isEngineMoving ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />}
          onClick={() => void playEngineMove()}
          disabled={isEngineMoving || isGameOver}
        />
      </SimpleTooltip>
    </div>
  );
}
