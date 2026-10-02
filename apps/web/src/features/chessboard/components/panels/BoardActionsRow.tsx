"use client";

import { useState } from "react";
import { ClipboardPaste, Copy, Cpu, Loader2, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { uploadPgn } from "@/lib/uploadApi";
import { cn } from "@/lib/utils";
import { analyzePosition } from "../../api/stockfishApi";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { NavIconButton } from "../toolbars/BoardNavigation";

/** Coach's board actions: save, setup position, undo/redo, PGN copy/paste, engine move. */
export function BoardActionsRow({ onPastePgn, className }: { onPastePgn: () => void; className?: string }) {
  const { fen, pgn, undo, redo, historyIndex, moveHistory, isGameOver, makeMove, setIsSetupPositionOpen } = useBoardStore(
    useShallow((s) => ({
      fen: s.fen,
      pgn: s.pgn,
      undo: s.undo,
      redo: s.redo,
      historyIndex: s.historyIndex,
      moveHistory: s.moveHistory,
      isGameOver: s.isGameOver,
      makeMove: s.makeMove,
      setIsSetupPositionOpen: s.setIsSetupPositionOpen,
    })),
  );
  const [isEngineMoving, setIsEngineMoving] = useState(false);

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

  const handleEngineMove = async () => {
    if (isGameOver) {
      toast.error("The game is already over.");
      return;
    }
    setIsEngineMoving(true);
    try {
      // Full strength, longer think — the engine is playing, not just advising.
      const analysis = await analyzePosition(fen, undefined, "move");
      const uci = analysis.bestMoveUci;
      if (!uci || uci.length < 4) {
        toast.error("Engine could not find a move for this position.");
        return;
      }
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      if (!makeMove(uci.slice(0, 2), uci.slice(2, 4), promotion)) {
        toast.error("Could not play the engine's move.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get the engine's move.");
    } finally {
      setIsEngineMoving(false);
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
        <NavIconButton aria-label="Undo" icon={<Undo2 className="size-4" />} onClick={undo} disabled={historyIndex < 0} />
      </SimpleTooltip>
      <SimpleTooltip label="Redo">
        <NavIconButton
          aria-label="Redo"
          icon={<Redo2 className="size-4" />}
          onClick={redo}
          disabled={historyIndex >= moveHistory.length - 1}
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
          onClick={handleEngineMove}
          disabled={isEngineMoving || isGameOver}
        />
      </SimpleTooltip>
    </div>
  );
}
