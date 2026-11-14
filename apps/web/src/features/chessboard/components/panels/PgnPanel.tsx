"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { loadPgnIntoBoard } from "../../lib/loadPgn";
import { Textarea } from "@/components/ui/Textarea";

/**
 * Shows the current game's PGN and lets a coach edit or paste a different one
 * in place. The draft follows the live board (a move, undo/redo, or engine
 * move updates it immediately) until the coach explicitly loads an edit.
 */
export function PgnPanel() {
  const { pgn, pushHistory } = useBoardStore(
    useShallow((s) => ({ pgn: s.pgn, pushHistory: s.pushHistory })),
  );
  const [draft, setDraft] = useState(pgn);
  // While the coach is editing, a move on the board must not wipe their draft.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(pgn);
  }, [pgn, dirty]);

  const handleCopy = async () => {
    if (!draft.trim()) {
      toast.error("No PGN to copy");
      return;
    }
    await navigator.clipboard.writeText(draft);
    toast.success("PGN copied to clipboard!");
  };

  const handleLoad = () => {
    const result = loadPgnIntoBoard(draft, pushHistory);
    if (result.ok) {
      setDirty(false);
      toast.success(
        result.moveCount > 0 ? `Game loaded (${result.moveCount} moves)` : "Position loaded"
      );
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-1 text-sm">
      <p className="text-xs text-app-muted">
        This is the current game&apos;s PGN. Edit it, or paste a different game, then Load it onto the board.
      </p>
      <Textarea
        aria-label="Game PGN"
        className="min-h-[220px] flex-1 font-mono text-xs"
        placeholder={'[Event "Casual game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {dirty ? (
          <Button
            variant="outline"
            onClick={() => setDirty(false)}
            className="h-auto px-3 py-1.5 text-xs font-normal"
          >
            Revert
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={handleCopy}
          className="h-auto px-3 py-1.5 text-xs font-normal"
        >
          Copy PGN
        </Button>
        <Button
          variant="primary"
          onClick={handleLoad}
          disabled={!draft.trim()}
          className="h-auto bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary"
        >
          Load PGN
        </Button>
      </div>
    </div>
  );
}
