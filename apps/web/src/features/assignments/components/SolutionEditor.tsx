"use client";

import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { SolutionMove } from "@nexa-chess/types";
import { ChevronDown, FileUp, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { Select } from "@/components/ui/Select";
import { parsePgnGames, parsePgnOrFen, type ImportedLine } from "../lib/importLine";

interface Props {
  startFen: string;
  value: SolutionMove[];
  onChange: (moves: SolutionMove[]) => void;
  orientation?: "white" | "black";
  /** Enables the "Import PGN / FEN" panel; receives the start position + mainline. */
  onImport?: (line: ImportedLine) => void;
}

// Admin builds the expected line by PLAYING it on the board. We capture UCI +
// SAN so the server never has to parse free-text PGN for scoring.
export function SolutionEditor({ startFen, value, onChange, orientation = "white", onImport }: Props) {
  const { fen, valid } = useMemo(() => {
    try {
      const chess = new Chess(startFen);
      for (const m of value) {
        chess.move({
          from: m.uci.slice(0, 2),
          to: m.uci.slice(2, 4),
          promotion: m.uci.slice(4) || undefined
        });
      }
      return { fen: chess.fen(), valid: true };
    } catch {
      return { fen: startFen, valid: false };
    }
  }, [startFen, value]);

  const handleMove = (mv: PracticeBoardMove) => {
    onChange([...value, { uci: mv.uci, san: mv.san }]);
  };

  return (
    <div className="space-y-4">
      {onImport ? <ImportPanel onImport={onImport} /> : null}
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <PracticeBoard
        fen={valid ? fen : startFen}
        orientation={orientation}
        interactive={valid}
        onMove={handleMove}
        className="md:w-[360px]"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-app-muted">
          Play the moves for both sides in the order the student should follow. The student sees the
          forced replies automatically.
        </p>
        {value.length === 0 ? (
          <p className="text-sm text-app-muted">No solution moves recorded yet.</p>
        ) : (
          <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
            {value.map((m, i) => (
              <li key={i} className="flex items-center gap-1">
                {i % 2 === 0 && <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>}
                <span className="font-medium text-app-text">{m.san}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.length === 0}
            onClick={() => onChange(value.slice(0, -1))}
          >
            <Undo2 className="mr-1.5 size-4" strokeWidth={2.5} />
            Undo last move
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.length === 0}
            onClick={() => onChange([])}
          >
            <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
            Reset solution
          </Button>
        </div>
      </div>
    </div>
    </div>
  );
}

function ImportPanel({ onImport }: { onImport: (line: ImportedLine) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<{ raw: string; titles: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (raw: string, gameIndex?: number) => {
    try {
      if (gameIndex === undefined) {
        const found = raw.includes("[") ? parsePgnGames(raw) : [];
        if (found.length > 1) {
          setGames({ raw, titles: found.map((g) => g.title) });
          setError(null);
          return;
        }
      }
      onImport(parsePgnOrFen(raw, gameIndex));
      setError(null);
      setText("");
      setGames(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that.");
    }
  };

  return (
    <div className="rounded-app border border-app-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-primary-ink"
      >
        Import PGN / FEN
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-app-border p-3">
          <p className="text-xs text-app-muted">
            A FEN sets the starting position. A PGN sets it from its [FEN] tag (or the initial
            position) and fills the solution with its main line. This replaces the current position
            and solution.
          </p>
          <Textarea
            rows={4}
            className="font-mono text-xs"
            value={text}
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setGames(null);
            }}
            placeholder={'1. e4 e5 2. Nf3 ... (add a [FEN "..."] tag for a custom start) — or paste a FEN'}
          />
          {games ? (
            <div className="space-y-1">
              <p className="text-xs text-app-muted">
                This PGN has {games.titles.length} games — pick the one to load.
              </p>
              <Select
                aria-label="Game to import"
                value=""
                placeholder="Choose a game"
                options={games.titles.map((t, i) => ({ value: String(i), label: `${i + 1}. ${t}` }))}
                onChange={(e) => {
                  if (e.target.value) apply(games.raw, Number(e.target.value));
                }}
              />
            </div>
          ) : null}
          {error ? <p className="text-xs text-app-danger-ink">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => apply(text)}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.fen,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) apply(await file.text());
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="mr-1.5 size-4" strokeWidth={2.5} />
              Upload .pgn
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
